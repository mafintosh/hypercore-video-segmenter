var protobuf = require('protocol-buffers')

module.exports = protobuf(`
  message Index {
    required bytes segments = 1;
  }

  message Segment {
    required uint64 seq = 1;
    required uint64 offset = 2;
    required uint64 blocks = 3;
    required uint64 length = 4;
    required uint64 duration = 5;
  }
`)
