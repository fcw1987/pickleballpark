// Local lossless-frame-input H.264 review encoder. Requires macOS system frameworks only.
import Foundation
import AVFoundation
import AppKit
import CoreVideo

func fail(_ message: String) -> Never { fputs(message + "\n", stderr); exit(1) }
guard CommandLine.arguments.count == 5 else { fail("Usage: encode-pixel-review frames-dir fps output.mp4 metadata.json") }
let framesURL = URL(fileURLWithPath: CommandLine.arguments[1])
guard let fps = Int32(CommandLine.arguments[2]), fps > 0 else { fail("Invalid frame cadence") }
let output = URL(fileURLWithPath: CommandLine.arguments[3])
let metadata = URL(fileURLWithPath: CommandLine.arguments[4])
let frames = try FileManager.default.contentsOfDirectory(at: framesURL, includingPropertiesForKeys: nil).filter { $0.pathExtension == "png" }.sorted { $0.lastPathComponent < $1.lastPathComponent }
guard let first = frames.first, let image = NSImage(contentsOf: first), let firstCG = image.cgImage(forProposedRect:nil,context:nil,hints:nil) else { fail("No valid PNG frames") }
let width = firstCG.width, height = firstCG.height
guard width % 2 == 0, height % 2 == 0 else { fail("H.264 requires even dimensions; refusing to resize source") }
if FileManager.default.fileExists(atPath: output.path) { try FileManager.default.removeItem(at: output) }
let writer = try AVAssetWriter(outputURL: output, fileType: .mp4)
writer.shouldOptimizeForNetworkUse = true
let settings: [String: Any] = [AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: width, AVVideoHeightKey: height, AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 12000000, AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel, AVVideoMaxKeyFrameIntervalKey: Int(fps)*2, AVVideoAllowFrameReorderingKey: false]]
let input = AVAssetWriterInput(mediaType:.video,outputSettings:settings)
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput:input,sourcePixelBufferAttributes:[kCVPixelBufferPixelFormatTypeKey as String:kCVPixelFormatType_32ARGB,kCVPixelBufferWidthKey as String:width,kCVPixelBufferHeightKey as String:height,kCVPixelBufferCGImageCompatibilityKey as String:true,kCVPixelBufferCGBitmapContextCompatibilityKey as String:true])
guard writer.canAdd(input) else { fail("Cannot add H.264 writer input") }
writer.add(input)
guard writer.startWriting() else { fail("Cannot start writer: \(String(describing:writer.error))") }
writer.startSession(atSourceTime:.zero)
for (index, frame) in frames.enumerated() {
 autoreleasepool {
  guard let picture=NSImage(contentsOf:frame),let cg=picture.cgImage(forProposedRect:nil,context:nil,hints:nil),cg.width==width,cg.height==height else { fail("Inconsistent frame: \(frame.path)") }
  var pixel: CVPixelBuffer?
  guard CVPixelBufferPoolCreatePixelBuffer(nil,adaptor.pixelBufferPool!,&pixel)==kCVReturnSuccess, let buffer=pixel else { fail("Pixel buffer allocation failed") }
  CVPixelBufferLockBaseAddress(buffer,[])
  guard let context=CGContext(data:CVPixelBufferGetBaseAddress(buffer),width:width,height:height,bitsPerComponent:8,bytesPerRow:CVPixelBufferGetBytesPerRow(buffer),space:CGColorSpaceCreateDeviceRGB(),bitmapInfo:CGImageAlphaInfo.noneSkipFirst.rawValue) else { fail("Cannot create frame context") }
  context.interpolationQuality = .none
  context.draw(cg,in:CGRect(x:0,y:0,width:width,height:height))
  CVPixelBufferUnlockBaseAddress(buffer,[])
  while !input.isReadyForMoreMediaData { if writer.status == .failed { fail("Writer failed: \(String(describing:writer.error))") }; Thread.sleep(forTimeInterval:0.002) }
  guard adaptor.append(buffer,withPresentationTime:CMTime(value:Int64(index),timescale:fps)) else { fail("Frame append failed: \(String(describing:writer.error))") }
 }
}
writer.endSession(atSourceTime:CMTime(value:Int64(frames.count),timescale:fps))
input.markAsFinished()
let done=DispatchSemaphore(value:0);writer.finishWriting { done.signal() };done.wait()
guard writer.status == .completed else { fail("Encoding incomplete: \(String(describing:writer.error))") }
let asset=AVURLAsset(url:output)
guard let track=asset.tracks(withMediaType:.video).first else { fail("Encoded track missing") }
let generator=AVAssetImageGenerator(asset:asset);generator.appliesPreferredTrackTransform=true;generator.requestedTimeToleranceBefore = .zero;generator.requestedTimeToleranceAfter = .zero
for (n,seconds) in [0.0,Double(frames.count)/Double(fps)/2,max(0,Double(frames.count-1)/Double(fps))].enumerated() {
 let sample=try generator.copyCGImage(at:CMTime(seconds:seconds,preferredTimescale:fps),actualTime:nil)
 let png=NSBitmapImageRep(cgImage:sample).representation(using:.png,properties:[:])!
 try png.write(to:output.deletingLastPathComponent().appendingPathComponent("mp4-sample-\(n).png"))
}
let info:[String:Any] = ["codec":"H.264","container":"MP4","width":Int(track.naturalSize.width),"height":Int(track.naturalSize.height),"fps":Double(track.nominalFrameRate),"frames":frames.count,"durationSeconds":CMTimeGetSeconds(asset.duration),"sourceFrameCount":frames.count,"resized":false,"output":output.lastPathComponent]
try JSONSerialization.data(withJSONObject:info,options:[.prettyPrinted,.sortedKeys]).write(to:metadata)
print(String(data:try JSONSerialization.data(withJSONObject:info,options:[.sortedKeys]),encoding:.utf8)!)
