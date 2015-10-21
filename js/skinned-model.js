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

var SkinnedModel = (function() {

  "use strict";
  
  var MAX_BONES_PER_MESH = 50;

  // Skinned Model Shader
  var skinnedModelVS = [
    "#version 300 es",
    "uniform vec3 lightDirection;",

    "out vec3 vLightToPoint;",
    "out vec3 vEyeToPoint;",

    "void setupLight(vec3 worldPosition) {",
    "   vLightToPoint = lightDirection;",
    "   vEyeToPoint = -worldPosition;",
    "}",

    "in vec3 position;",
    "in vec2 texture;",
    "in vec3 normal;",
    "in vec3 weights;",
    "in vec3 bones;",

    "uniform mat4 viewMat;",
    "uniform mat4 modelMat;",
    "uniform mat4 projectionMat;",
    "uniform mat4 boneMat[" + MAX_BONES_PER_MESH + "];",
    
    "out vec2 vTexture;",
    "out vec3 vNormal;",
    
    "mat4 accumulateSkinMat() {",
    "   mat4 result = weights.x * boneMat[int(bones.x)];",
    "   result = result + weights.y * boneMat[int(bones.y)];",
    "   result = result + weights.z * boneMat[int(bones.z)];",
    "   return result;",
    "}",
    
    // A "manual" rotation matrix transpose to get the normal matrix
    "mat3 getNormalMat(mat4 mat) {",
    "   return mat3(mat[0][0], mat[1][0], mat[2][0], mat[0][1], mat[1][1], mat[2][1], mat[0][2], mat[1][2], mat[2][2]);",
    "}",

    "void main(void) {",
    "   mat4 skinMat = modelMat * accumulateSkinMat();",
    "   mat3 normalMat = getNormalMat(skinMat);",
    
    "   vec4 vPosition = skinMat * vec4(position, 1.0);",
    "   gl_Position = projectionMat * viewMat * vPosition;",

    "   vTexture = texture;",
    "   vNormal = normalize(normal * normalMat);",
    "   setupLight(vPosition.xyz);",
    "}"
  ].join("\n");

  var skinnedModelFS = [
    "#version 300 es",
    "precision highp float;",

    "in vec3 vLightToPoint;",
    "in vec3 vEyeToPoint;",

    "out vec4 fragColor;",

    "uniform vec3 lightColor;",

    "vec3 computeLight(vec3 normal, float specularLevel) {",
    // Lambert term
    "   vec3 l = normalize(vLightToPoint);",
    "   vec3 n = normalize(normal);",
    "   float lambertTerm = max(dot(n, l), 0.0);",

    "   if(lambertTerm < 0.0) { return vec3(0.0, 0.0, 0.0); }",

    "   vec3 lightValue = (lightColor * lambertTerm);",

    // Specular
    "   vec3 e = normalize(vEyeToPoint);",
    "   vec3 r = reflect(-l, n);",
    "   float shininess = 8.0;",
    "   float specularFactor = pow(clamp(dot(r, e), 0.0, 1.0), shininess) * specularLevel;",
    "   vec3 specularColor = lightColor;",
    "   lightValue += (specularColor * specularFactor);",

    "   return lightValue;",
    "}",

    "uniform vec3 ambient;",
    "uniform sampler2D diffuse;",

    "in vec2 vTexture;",
    "in vec3 vNormal;",

    "void main(void) {",
    "   vec4 diffuseColor = texture(diffuse, vTexture);",
    "   vec3 lightValue = computeLight(vNormal, diffuseColor.a);",
    "   vec3 finalColor = diffuseColor.rgb * ambient;",
    "   finalColor += diffuseColor.rgb * lightValue;",
    "   fragColor = vec4(finalColor, 1.0);",
    "}"
  ].join("\n");

  // Vertex Format Flags
  var ModelVertexFormat = {
    Position: 0x0001,
    UV: 0x0002,
    UV2: 0x0004,
    Normal: 0x0008,
    Tangent: 0x0010,
    Color: 0x0020,
    BoneWeights: 0x0040
  };

  var ModelVertexAttribs = {
    position: 0,
    texture: 1,
    normal: 2,
    weights: 3,
    bones: 4,
  };

  function GetLumpId(id) {
    var str = "";
    str += String.fromCharCode(id & 0xff);
    str += String.fromCharCode((id >> 8) & 0xff);
    str += String.fromCharCode((id >> 16) & 0xff);
    str += String.fromCharCode((id >> 24) & 0xff);
    return str;
  };

  var Skeleton = function() {
    this.bones = [];
    this.boneMatrices = null;
    this._dirtyBones = true;
  };

  Skeleton.prototype._parseBones = function(doc) {
    var i, bone;
    this.bones = doc.bones ? doc.bones : [];

    var tempMat = mat4.create();
    var tempQuat = quat.create();
    // Force all bones to use efficient data structures
    for (i in this.bones) {
      bone = this.bones[i];

      bone.pos = vec3.clone(bone.pos);
      bone.rot = quat.clone(bone.rot);
      bone.bindPoseMat = mat4.clone(bone.bindPoseMat);
      bone.boneMat = mat4.create();
      if (bone.parent == -1) {
        // These two lines apply a 90 deg rotation to the root node to make the model z-up
        quat.setAxisAngle(tempQuat, [1, 0, 0], Math.PI * 0.5);
        quat.multiply(bone.rot, bone.rot, tempQuat);
        
        bone.worldPos = bone.pos;
        bone.worldRot = bone.rot;
      } else {
        bone.worldPos = vec3.create();
        bone.worldRot = quat.create();
      }
    }

    this.boneMatrices = new Float32Array(16 * this.bones.length);
  };

  Skeleton.prototype.getBoneMatrices = function(offset, count) {
    if(this._dirtyBones) {
      for(var i = 0; i < this.bones.length; ++i) {
        var bone = this.bones[i];
        this.boneMatrices.set(bone.boneMat, i * 16);
      }
      this._dirtyBones = false;
    }

    return this.boneMatrices.subarray(offset * 16, (offset + count) * 16);
  };

  Skeleton.prototype.clone = function(offset, count) {
    var i, srcBone, destBone;
    var out = new Skeleton();

    for (i in this.bones) {
      srcBone = this.bones[i];
      out.bones[i] = {
        parent: srcBone.parent,
        name: srcBone.name,
        skinned: srcBone.skinned,
        pos: vec3.clone(srcBone.pos),
        rot: quat.clone(srcBone.rot),
        bindPoseMat: mat4.clone(srcBone.bindPoseMat),
        boneMat: mat4.create(),
        worldPos: vec3.clone(srcBone.pos),
        worldRot: quat.clone(srcBone.rot),
      };
    }
    out.boneMatrices = new Float32Array(16 * this.bones.length);
    return out;
  };

  var SkinnedModel = function (gl) {
    this.gl = gl;
    this.vertexFormat = 0;
    this.vertexStride = 0;
    this.vertexBuffer = null;
    this.indexBuffer = null;
    this.vao = null;
    this.meshes = null;
    this.complete = false;
    this.skeleton = null;
    this.program = null;
    this._textureLoader = new WGLUTextureLoader(gl);
  };

  SkinnedModel.prototype.load = function (url, callback) {
    var gl = this.gl;
    var self = this,
    vertComplete = false,
    modelComplete = false;

    // Load the binary portion of the model
    var vertXhr = new XMLHttpRequest();
    vertXhr.open('GET', url + ".wglvert", true);
    vertXhr.responseType = "arraybuffer";
    vertXhr.onload = function() {
      var arrays = self._parseBinary(this.response);
      self._compileBuffers(arrays);
      vertComplete = true;
      
      if (modelComplete) {
        self.complete = true;
        if (callback) { callback(self); }
      }
    };
    vertXhr.send(null);

    // Load the json portion of the model
    var jsonXhr = new XMLHttpRequest();
    jsonXhr.open('GET', url + ".wglmodel", true);
    jsonXhr.onload = function() {
      // TODO: Error Catch!
      var model = JSON.parse(this.responseText);
      self._parseModel(model);
      self._compileMaterials(self.meshes);
      modelComplete = true;

      if (vertComplete) {
        self.complete = true;
        if (callback) { callback(self); }
      }
    };
    jsonXhr.send(null);

    if (!this.program) {
      this.program = new WGLUProgram(gl);
      this.program.attachShaderSource(skinnedModelVS, gl.VERTEX_SHADER);
      this.program.attachShaderSource(skinnedModelFS, gl.FRAGMENT_SHADER);
      this.program.bindAttribLocation(ModelVertexAttribs);
      this.program.link();
    }
  };

  SkinnedModel.prototype._parseBinary = function (buffer) {
    var arrays = {
      vertexArray: null,
      indexArray: null
    };

    var header = new Uint32Array(buffer, 0, 3);
    if(GetLumpId(header[0]) !== "wglv") {
      throw new Error("Binary file magic number does not match expected value.");
    }
    if(header[1] > 1) {
      throw new Error("Binary file version is not supported.");
    }
    var lumpCount = header[2];

    header = new Uint32Array(buffer, 12, lumpCount * 3);

    var i, lumpId, offset, length;
    for(i = 0; i < lumpCount; ++i) {
      lumpId = GetLumpId(header[i * 3]);
      offset = header[(i * 3) + 1];
      length = header[(i * 3) + 2];

      switch(lumpId) {
        case "vert":
          arrays.vertexArray = this._parseVert(buffer, offset, length);
          break;

        case "indx":
          arrays.indexArray = this._parseIndex(buffer, offset, length);
          break;
      }
    }
    
    return arrays;
  };

  SkinnedModel.prototype._parseVert = function(buffer, offset, length) {
    var vertHeader = new Uint32Array(buffer, offset, 2);
    this.vertexFormat = vertHeader[0];
    this.vertexStride = vertHeader[1];

    return new Uint8Array(buffer, offset + 8, length - 8);
  };

  SkinnedModel.prototype._parseIndex = function(buffer, offset, length) {
    return new Uint16Array(buffer, offset, length / 2);
  };

  SkinnedModel.prototype._compileBuffers = function (arrays) {
    var gl = this.gl;

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    this.vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, arrays.vertexArray, gl.STATIC_DRAW);

    this.indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, arrays.indexArray, gl.STATIC_DRAW);

    // Enable the appropriate vertex attribs
    gl.enableVertexAttribArray(ModelVertexAttribs.position);
    gl.enableVertexAttribArray(ModelVertexAttribs.texture);
    gl.enableVertexAttribArray(ModelVertexAttribs.normal);
    gl.enableVertexAttribArray(ModelVertexAttribs.weights);
    gl.enableVertexAttribArray(ModelVertexAttribs.bones);

    // Setup the vertex layout
    gl.vertexAttribPointer(ModelVertexAttribs.position, 3, gl.FLOAT, false, this.vertexStride, 0);
    gl.vertexAttribPointer(ModelVertexAttribs.texture, 2, gl.FLOAT, false, this.vertexStride, 12);
    gl.vertexAttribPointer(ModelVertexAttribs.normal, 3, gl.FLOAT, false, this.vertexStride, 20);
    gl.vertexAttribPointer(ModelVertexAttribs.weights, 3, gl.FLOAT, false, this.vertexStride, 48);
    gl.vertexAttribPointer(ModelVertexAttribs.bones, 3, gl.FLOAT, false, this.vertexStride, 60);

    gl.bindVertexArray(null);
  };

  SkinnedModel.prototype._parseModel = function(doc) {
    var i, bone;

    this.meshes = doc.meshes;
    this.skeleton = new Skeleton();
    this.skeleton._parseBones(doc);
  };

  SkinnedModel.prototype._compileMaterials = function (meshes) {
    var i, mesh;
    for (i in meshes) {
      mesh = meshes[i];
      mesh.diffuse = this._textureLoader.loadTexture(mesh.defaultTexture);
    }
  };

  SkinnedModel.prototype.draw = function (modelMat, viewMat, projectionMat, skeleton) {
    if (!this.complete) { return; }

    if (!skeleton) {
      skeleton = this.skeleton;
    }

    var gl = this.gl;
    var program = this.program;
    var i, j,
        mesh, submesh, boneSet,
        indexOffset, indexCount;

    program.use();

    gl.uniform3f(program.uniform.lightDirection, 1.0, -1.0, 1.0);
    gl.uniform3f(program.uniform.lightColor, 1.0, 1.0, 1.0);
    gl.uniform3f(program.uniform.ambient, 0.25, 0.25, 0.25);

    gl.uniformMatrix4fv(program.uniform.viewMat, false, viewMat);
    gl.uniformMatrix4fv(program.uniform.modelMat, false, modelMat);
    gl.uniformMatrix4fv(program.uniform.projectionMat, false, projectionMat);

    // Bind the vertex/index buffers
    gl.bindVertexArray(this.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(program.uniform.diffuse, 0);

    for (i in this.meshes) {
      mesh = this.meshes[i];
      
      gl.bindTexture(gl.TEXTURE_2D, mesh.diffuse);
      
      for (j in mesh.submeshes) {
        submesh = mesh.submeshes[j];
        
        boneSet = skeleton.getBoneMatrices(submesh.boneOffset, submesh.boneCount);
        gl.uniformMatrix4fv(program.uniform.boneMat, false, boneSet);
        
        gl.drawElements(gl.TRIANGLES, submesh.indexCount, gl.UNSIGNED_SHORT, submesh.indexOffset*2);
      }
    }
  };

  return SkinnedModel;
})();