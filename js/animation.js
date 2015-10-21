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

var SkeletalAnimation = (function () {

  "use strict";

  var Animation = function () {
    this.name = null;
    this.frameRate = 0;
    this.duration = 0;
    this.frameCount = 0;
    this.bonesIds = {};
    this.keyframes = [];
    this.complete = false;
  };

  Animation.prototype.load = function (url, callback) {
    var self = this;

    // Load the binary portion of the model
    var animXhr = new XMLHttpRequest();
    animXhr.open('GET', url + ".wglanim", true);
    animXhr.onload = function() {
      // TODO: Error Catch!
      var anim = JSON.parse(this.responseText);
      self._parseAnim(anim);
      if (callback) { callback(self); }
    };
    animXhr.send(null);
  };

  Animation.prototype._parseAnim = function (anim) {
    var i, j, keyframe, bone;

    this.name = anim.name;
    this.frameRate = anim.frameRate;
    this.duration = anim.duration;
    this.frameCount = anim.frameCount;

    // Build a table to lookup bone id's
    for(i = 0; i < anim.bones.length; ++i) {
      this.bonesIds[anim.bones[i]] = i;
    }
    this.keyframes = anim.keyframes;

    // Force all bones to use efficient data structures
    for (i in this.keyframes) {
      keyframe = this.keyframes[i];

      for(j in keyframe) {
        bone = keyframe[j];
        bone.pos = vec3.clone(bone.pos);
        bone.rot = quat.clone(bone.rot);
      }
    }
  };

  // Apply the tranforms of the given frame to the skeleton
  Animation.prototype.evaluate = function (frameId, skeleton) {
    var i, boneId, bones, bone, frame, frameBone, parent;
    
    bones = skeleton.bones;
    if(!bones) { return; }

    frame = this.keyframes[frameId];

    // Go in the order that the skeleton specifies, will always process parents first
    for(i = 0; i < bones.length; ++i) {
      bone = bones[i];
      boneId = this.bonesIds[bone.name];

      if(boneId !== undefined) {
        frameBone = frame[boneId];
        bone.pos = frameBone.pos;
        bone.rot = frameBone.rot;
      }

      // No parent? No transform needed
      if(bone.parent !== -1) {
        parent = bones[bone.parent];

        // Apply the parent transform to this bone
        vec3.transformQuat(bone.worldPos, bone.pos, parent.worldRot);
        vec3.add(bone.worldPos, bone.worldPos, parent.worldPos);
        quat.multiply(bone.worldRot, parent.worldRot, bone.rot);
      }

      // We only need to compute the matrices for bones that actually have vertices assigned to them
      if(bone.skinned) {
        mat4.fromRotationTranslation(bone.boneMat, bone.worldRot, bone.worldPos);
        mat4.multiply(bone.boneMat, bone.boneMat, bone.bindPoseMat);
      }
    }

    skeleton._dirtyBones = true; // Notify the skeleton that it needs to update it's bone matrices
  };

  return Animation;
})();