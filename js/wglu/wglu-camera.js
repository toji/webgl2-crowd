/*
Copyright (c) 2015, Brandon Jones.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

/*
 * This file contains a couple of self-contained camera classes. The cameras
 * handle user input internally and produce a view matrix that can be applied
 * to the rendered scene.
 */
var WGLUCamera = (function () {

  "use strict";

  var OrbitCamera, FlyingCamera;
  
  function axisDeadzone(value) {
    return Math.abs(value) > 0.35 ? value : 0;
  }

  /**
   * A OrbitCamera is one that always points at a central point and orbits around at a fixed radius
   * This type of camera is good for displaying individual models
   */
  OrbitCamera = function (element) {
    this._distance = vec3.create([0, 0, -32]);
    this._center = vec3.create();
    this._viewMat = mat4.create();
    this._yUp = true;

    this.orbitX = 0;
    this.orbitY = 0;
    this.maxOrbitX = Math.PI * 0.5;
    this.minOrbitX = -Math.PI * 0.5;
    this.maxOrbitY = Math.PI;
    this.minOrbitY = -Math.PI;
    this.constrainXOrbit = true;
    this.constrainYOrbit = false;
    
    this.maxDistance = 512;
    this.minDistance = 16;
    this.distanceStep = 1.0;
    this.constrainDistance = true;

    this._dirty = true;

    this._hookEvents(element);
  };

  OrbitCamera.prototype._hookEvents = function (element) {
    var self = this, moving = false,
      lastX, lastY;

    //==============
    // Mouse Events
    //==============
    element.addEventListener('mousedown', function (event) {
      if (event.which === 1) {
        moving = true;
      }
      lastX = event.pageX;
      lastY = event.pageY;
    }, false);

    element.addEventListener('mousemove', function (event) {
      if (moving) {
        var xDelta = event.pageX  - lastX,
          yDelta = event.pageY  - lastY;

        lastX = event.pageX;
        lastY = event.pageY;

        self.orbit(xDelta * 0.025, yDelta * 0.025);
      }
    }, false);

    element.addEventListener('mouseup', function () {
      moving = false;
    }, false);

    element.addEventListener('mousewheel', function (event) {
      self.setDistance(-self._distance[2] + (event.wheelDeltaY * self.distanceStep));
      event.preventDefault();
    }, false);

    //==============
    // Touch Events
    //==============
    element.addEventListener('touchstart', function(event) {
      var touches = event.touches;
      switch(touches.length) {
        case 1: // Single finger looks around
          moving = true;
          lastX = touches[0].pageX;
          lastY = touches[0].pageY;
          break;
        case 2:
          // Two fingers zoom, maybe?
          break;
        default:
          return;
      }
      event.stopPropagation();
      event.preventDefault();
    }, false);

    element.addEventListener('touchmove', function(event) {
      var touches = event.touches;
      if(moving) {
        var xDelta = touches[0].pageX  - lastX,
          yDelta = touches[0].pageY  - lastY;

        lastX = touches[0].pageX;
        lastY = touches[0].pageY;

        self.orbit(xDelta * 0.005, yDelta * 0.005);
      }
      event.stopPropagation();
      event.preventDefault();
    }, false);

    element.addEventListener('touchend', function(event) {
      moving = false;
      event.stopPropagation();
      event.preventDefault();
    }, false);
  };
  
  OrbitCamera.prototype.orbit = function (xDelta, yDelta) {
    if(xDelta || yDelta) {

      this.orbitY += xDelta;

      if(this.constrainYOrbit) {
        this.orbitY = Math.min(Math.max(this.orbitY, this.minOrbitY), this.maxOrbitY);
      } else {
        while (this.orbitY < -Math.PI) {
          this.orbitY += Math.PI * 2;
        }
        while (this.orbitY >= Math.PI) {
          this.orbitY -= Math.PI * 2;
        }
      }

      this.orbitX += yDelta;

      if(this.constrainXOrbit) {
        this.orbitX = Math.min(Math.max(this.orbitX, this.minOrbitX), this.maxOrbitX);
      } else {
        while (this.orbitX < -Math.PI) {
          this.orbitX += Math.PI * 2;
        }
        while (this.orbitX >= Math.PI) {
          this.orbitX -= Math.PI * 2;
        }
      }

      this._dirty = true;
    }
  };

  OrbitCamera.prototype.getCenter = function () {
    return [-this._center[0], -this._center[1], -this._center[2]];
  };

  OrbitCamera.prototype.setCenter = function (value) {
    this._center[0] = -value[0];
    this._center[1] = -value[1];
    this._center[2] = -value[2];
    this._dirty = true;
  };

  OrbitCamera.prototype.getDistance = function () {
    return -this._distance[2];
  };

  OrbitCamera.prototype.setDistance = function (value) {
    this._distance[2] = -value;
    if(this.constrainDistance) {
      this._distance[2] = Math.min(Math.max(-this._distance[2], this.minDistance), this.maxDistance) * -1.0;
    }
    this._dirty = true;
  };

  OrbitCamera.prototype.getYUp = function () {
    return this._yUp;
  };

  OrbitCamera.prototype.setYUp = function (value) {
    this._yUp = value;
    this._dirty = true;
  };

  OrbitCamera.prototype.getViewMat = function () {
    if (this._dirty) {
      var mv = this._viewMat;
      mat4.identity(mv);
      mat4.translate(mv, mv, this._distance);
      mat4.rotateX(mv, mv, this.orbitX);
      mat4.rotateY(mv, mv, this.orbitY);
      mat4.rotateX(mv, mv, -Math.PI * 0.5);
      mat4.translate(mv, mv, this._center);
      if(!this._yUp) { mat4.rotateX(mv, mv, Math.PI * 0.5); }
      
      this._dirty = false;
    }

    return this._viewMat;
  };

  OrbitCamera.prototype.update = function (timestamp) {
    var pad, i;
    var gamepads = navigator.getGamepads();
    for (i = 0; i < gamepads.length; ++i) {
      pad = gamepads[i];
      if(pad) {
        if(pad.id.indexOf("Space Navigator") != -1) {
          this.orbit(axisDeadzone(pad.axes[4]) * -0.05, axisDeadzone(pad.axes[3]) * -0.05);
        } else {
          this.orbit(axisDeadzone(pad.axes[0]) * 0.05, axisDeadzone(pad.axes[1]) * 0.05);
          this.orbit(axisDeadzone(pad.axes[2]) * 0.05, axisDeadzone(pad.axes[3]) * 0.05);
        }
      }
    }
  };

  /**
   * A FlyingDemoCamera allows free motion around the scene using FPS style controls (WASD + mouselook)
   * This type of camera is good for displaying large scenes
   */
  FlyingCamera = function (element) {
    this._angles = vec3.create();
    this._position = vec3.create();
    this.speed = 100;
    this._pressedKeys = new Array(128);
    this._viewMat = mat4.create();
    this._rotMat = mat4.create();
    this._dirty = true;
    this._timestamp = null;

    this._hookEvents(element);
  };

  FlyingCamera.prototype._hookEvents = function (element) {
    var self = this, moving = false,
      lastX, lastY;

    // Set up the appropriate event hooks
    window.addEventListener("keydown", function (event) {
      self._pressedKeys[event.keyCode] = true;
    }, false);

    window.addEventListener("keyup", function (event) {
      self._pressedKeys[event.keyCode] = false;
    }, false);

    element.addEventListener('mousedown', function (event) {
      if (event.which === 1) {
        moving = true;
      }
      lastX = event.pageX;
      lastY = event.pageY;
    }, false);

    element.addEventListener('mousemove', function (event) {
      var xDelta, yDelta;
      
      if(document.pointerLockEnabled) {
        xDelta = event.movementX;
        yDelta = event.movementY;
        
        self.rotateView(xDelta * 0.025, yDelta * 0.025);
      } else if (moving) {
        xDelta = event.pageX  - lastX;
        yDelta = event.pageY  - lastY;

        lastX = event.pageX;
        lastY = event.pageY;

        self.rotateView(xDelta * 0.025, yDelta * 0.025);
      }
      
    }, false);

    element.addEventListener('mouseup', function () {
      moving = false;
    }, false);
  };

  FlyingCamera.prototype.rotateView = function (xDelta, yDelta) {
    var rot = this._rotMat;

    if(xDelta || yDelta) {
      this._angles[1] += xDelta;
      // Keep our rotation in the range of [0, 2*PI]
      // (Prevents numeric instability if you spin around a LOT.)
      while (this._angles[1] < 0) {
        this._angles[1] += Math.PI * 2.0;
      }
      while (this._angles[1] >= Math.PI * 2.0) {
        this._angles[1] -= Math.PI * 2.0;
      }

      this._angles[0] += yDelta;
      // Clamp the up/down rotation to prevent us from flipping upside-down
      if (this._angles[0] < -Math.PI * 0.5) {
        this._angles[0] = -Math.PI * 0.5;
      }
      if (this._angles[0] > Math.PI * 0.5) {
        this._angles[0] = Math.PI * 0.5;
      }
        
      // Update the directional matrix
      mat4.identity(rot);
      
      mat4.rotateZ(rot, -this._angles[1]);
      mat4.rotateX(rot, -this._angles[0]);

      this._dirty = true;
    }
  };

  FlyingCamera.prototype.getAngles = function () {
    return this._angles;
  };

  FlyingCamera.prototype.setAngles = function (value) {
    this._angles = value;
    this._dirty = true;
  };

  FlyingCamera.prototype.getPosition = function () {
    return this._position;
  };

  FlyingCamera.prototype.setPosition = function (value) {
    this._position = value;
    this._dirty = true;
  };

  FlyingCamera.prototype.getViewMat = function () {
    if (this._dirty) {
      var mv = this._viewMat;
      mat4.identity(mv);

      mat4.rotateX(mv, -Math.PI * 0.5);
      mat4.rotateX(mv, this._angles[0]);
      mat4.rotateZ(mv, this._angles[1]);
      mat4.translate(mv, [-this._position[0], -this._position[1], -this._position[2]]);
      this._dirty = false;
    }

    return this._viewMat;
  };

  FlyingCamera.prototype.update  = function (timestamp) {
    var frameTime = 0;
    if (this._timestamp && timestamp) {
      frameTime = timestamp - this._timestamp;
    }
    this._timestamp = timestamp;

    var dir = vec3.create(),
      speed = (this.speed / 1000) * frameTime,
      pad, i;

    // This is our first person movement code. It's not really pretty, but it works
    if (this._pressedKeys['W'.charCodeAt(0)]) {
      dir[1] += speed;
    }
    if (this._pressedKeys['S'.charCodeAt(0)]) {
      dir[1] -= speed;
    }
    if (this._pressedKeys['A'.charCodeAt(0)]) {
      dir[0] -= speed;
    }
    if (this._pressedKeys['D'.charCodeAt(0)]) {
      dir[0] += speed;
    }
    if (this._pressedKeys[32]) { // Space, moves up
      dir[2] += speed;
    }
    if (this._pressedKeys[17]) { // Ctrl, moves down
      dir[2] -= speed;
    }
    
    // Gamepad input
    for (i = 0; i < navigator.gamepads.length; ++i) {
      pad = navigator.gamepads[i];
      if(pad) {
        if(pad.id.indexOf("Space Navigator") != -1) {
          dir[0] += axisDeadzone(pad.axes[0]) * speed;
          dir[1] += axisDeadzone(pad.axes[1]) * -speed;
          dir[2] += axisDeadzone(pad.axes[2]) * -speed;
          this.rotateView(axisDeadzone(pad.axes[4]) * 0.05, axisDeadzone(pad.axes[3]) * -0.05);
        } else {
          dir[0] += axisDeadzone(pad.axes[0]) * speed;
          dir[1] += axisDeadzone(pad.axes[1]) * speed;
          this.rotateView(axisDeadzone(pad.axes[2]) * 0.05, axisDeadzone(pad.axes[3]) * 0.05);
        }
      }
    }

    if (dir[0] !== 0 || dir[1] !== 0 || dir[2] !== 0) {
      // Move the camera in the direction we are facing
      mat4.multiplyVec3(this._rotMat, dir);
      vec3.add(this._position, dir);

      this._dirty = true;
    }
    
  };

  return {
    OrbitCamera: OrbitCamera,
    FlyingCamera: FlyingCamera
  };
})();