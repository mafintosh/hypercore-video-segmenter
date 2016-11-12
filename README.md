# hypercore-video-segmenter

Store live streaming video segments using hypercore.

```
npm install hypercore-video-segmenter
```

## Usage

``` js
var segmenter = require('hypercore-video-segmenter')
var s = segmenter(someHypercore)

var ws = s.createSegmentWriteStream({
  duration: 10 // duration in seconds
}, function (err) {
  console.log('video segment added')
  s.get(0, console.log) // prints metadata of the first segment
})

var rs = fs.createReadStream('next-segment.ts')

rs.pipe(ws)
```

## API

#### `var s = segmenter(core, [key])`

Create a new segmenter.
If you want to replicate another segmenter pass a key.

#### `s.key`

The replication key verifying the data of the segmenter. Pass that to another segmenter, and connect it using replication streams to start replicating the data.

#### `s.discoveryKey`

A key that be used to discover similar segmenters, but that doesn't allow other people to download the data.

#### `var ws = s.createSegmentWriteStream(options, [callback])`

Write a new segment. You should specify how long this segment is in seconds in the options map using the `duration` key.

#### `var rs = s.createSegmentReadStream(seq)`

Create a read stream that returns segment data. `seq` is the segment index you want to read.

#### `s.get(seq, callback)`

Get metadata about a segment. `seq` is the segment index you want info about.
Returns an object looking like this

``` js
{
  seq: seq,
  duration: durationInSeconds
  length: byteLength
}
```

#### `s.getLatest(n, callback)`

Get the latest `n` segment metadata objects. Useful for generating a playlist.

#### `s.getNext(callback)`

Get the next segment metadata.

#### `var stream = s.replicate()`

Create a replication stream that replicates the data in the segmenter.
You should pipe this to another segmenter.

## License

MIT
