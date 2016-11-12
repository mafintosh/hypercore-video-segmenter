var choppa = require('choppa')
var collect = require('stream-collector')
var from = require('from2')
var thunky = require('thunky')
var messages = require('./messages')

module.exports = Segmenter

function Segmenter (core, key, opts) {
  if (!(this instanceof Segmenter)) return new Segmenter(core, key, opts)
  if (!opts) opts = {}

  this.index = core.createFeed(key)
  this.key = this.index.key
  this.discoveryKey = this.index.discoveryKey

  this.segments = key ? null : core.createFeed()
  this.segmentDuration = opts.segmentDuration || 0
  this.blockSize = opts.blockSize || 32 * 1024

  var self = this

  this._open = thunky(function (cb) {
    self.index.open(function (err) {
      if (err) return cb(err)
      if (self.segments) return self.segments.open(onseg)

      self.getIndex(function (err, index) {
        if (err) return cb(err)

        self.segments = core.createFeed(index.segments)
        self.segments.open(onseg)
      })
    })

    function onseg (err) {
      if (err) return cb(err)
      if (!self.segments.secretKey) return cb()
      if (self.index.blocks) return cb()
      self._appendIndex(cb)
    }
  })
}

Segmenter.prototype.replicate = function (stream) {
  var self = this

  stream = this.index.replicate(stream)
  this._open(function (err) {
    if (err) return stream.destroy(err)
    self.segments.replicate(stream)
  })

  return stream
}

Segmenter.prototype.unreplicate = function (stream) {
  var self = this

  stream = this.index.unreplicate(stream)
  this._open(function (err) {
    if (err) return stream.destroy(err)
    self.segments.unreplicate(stream)
  })

  return stream
}

Segmenter.prototype.getNext = function (cb) {
  var self = this
  this.index.open(function (err) {
    if (err) return cb(err)
    self.get(self.index.blocks - 1, cb)
  })
}

Segmenter.prototype.getLatest = function (n, cb) {
  var self = this
  this.index.open(function (err) {
    if (err) return cb(err)

    var error = null
    var head = self.index.blocks > 1 ? self.index.blocks - 2 : 0
    var cnt = Math.min(head + 1, n)
    var buf = []

    for (var i = 0; i < cnt; i++) self.get(head--, get)

    function get (err, segment) {
      if (err) error = err
      buf.push(segment)
      if (buf.length !== cnt) return
      if (error) return cb(err)
      buf.sort(sort)
      cb(null, buf)
    }
  })
}

Segmenter.prototype.getIndex = function (cb) {
  var index = null
  this.index.get(0, function (err, data) {
    if (err) return cb(err)

    try {
      index = messages.Index.decode(data)
    } catch (err) {
      return cb(err)
    }

    cb(null, index)
  })
}

Segmenter.prototype.get = function (seq, cb) {
  var entry = null
  this.index.get(seq + 1, function (err, data) {
    if (err) return cb(err)

    try {
      entry = messages.Segment.decode(data)
    } catch (err) {
      return cb(err)
    }

    cb(null, entry)
  })
}

Segmenter.prototype.createSegmentReadStream = function (seq) {
  var self = this
  var offset = 0
  var entry = null
  var stream = from(read)

  return stream

  function read (size, cb) {
    if (!entry) return readEntry(size, cb)
    if (offset === entry.blocks) return cb(null, null)
    self.segments.get(entry.offset + offset++, function (err, data) {
      if (err) return cb(err)
      cb(null, data)
    })
  }

  function readEntry (size, cb) {
    self._open(function (err) {
      if (err) return cb(err)
      self.get(seq, function (err, result) {
        if (err) return cb(err)

        entry = result

        var range = {
          start: result.offset,
          end: result.offset + result.blocks,
          priority: 1,
          linear: true
        }

        self.segments.prioritize(range)
        stream.on('close', function () {
          self.segments.unprioritize(range)
        })

        read(size, cb)
      })
    })
  }
}

Segmenter.prototype.createSegmentWriteStream = function (opts, cb) {
  if (typeof opts === 'function') return this.createSegmentWriteStream(null, opts)
  if (!opts) opts = {}
  if (!opts.duration) opts.duration = this.segmentDuration
  if (!opts.duration) throw new Error('You MUST specify options.duration')
  if (!cb) cb = noop

  var self = this
  return collect(choppa(this.blockSize), function (err, bufs) {
    if (err) return cb(err)
    if (!bufs.length) return cb(null)

    // TODO: we really need cross-feed batching

    self._open(function (err) {
      if (err) return cb(err)

      self.index.append(messages.Segment.encode({
        seq: self.index.blocks - 1,
        offset: self.segments.blocks,
        blocks: bufs.length,
        length: bufs.reduce(add, 0),
        duration: opts.duration
      }), function (err) {
        if (err) return cb(err)
        self.segments.append(bufs, cb)
      })
    })
  })
}

Segmenter.prototype._appendIndex = function (cb) {
  this.index.append(messages.Index.encode({
    segments: this.segments.key,
    duration: this.segmentDuration
  }), cb)
}

function add (size, buf) {
  return buf.length + size
}

function noop () {}

function sort (a, b) {
  return a.seq - b.seq
}
