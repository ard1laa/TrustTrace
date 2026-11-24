// macOS Vision OCR with layout. Prints JSON:
// { "width": W, "height": H, "lines": [ { "text", "confidence", "box": [x,y,w,h], "quad": [[x,y]x4], "words": [ { "text", "box" } ] } ] }
// Coordinates are normalised to 0…1 with a top-left origin. PDFs are rendered (page 1) before recognition.
//
// Build: swiftc -O server/ocr/vision_layout.swift -o server/ocr/vision_layout
import Foundation
import Vision
import CoreGraphics
import ImageIO
import PDFKit
import AppKit

func fail(_ message: String) -> Never {
  FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
  exit(1)
}

func loadImage(_ path: String) -> CGImage? {
  let url = URL(fileURLWithPath: path)
  if path.lowercased().hasSuffix(".pdf") {
    guard let doc = PDFDocument(url: url), let page = doc.page(at: 0) else { return nil }
    let bounds = page.bounds(for: .mediaBox)
    let scale = 2200.0 / max(bounds.width, bounds.height)
    let size = NSSize(width: bounds.width * scale, height: bounds.height * scale)
    let thumb = page.thumbnail(of: size, for: .mediaBox)
    var rect = NSRect(origin: .zero, size: thumb.size)
    return thumb.cgImage(forProposedRect: &rect, context: nil, hints: nil)
  }
  guard let src = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
  let opts: [CFString: Any] = [
    kCGImageSourceCreateThumbnailFromImageAlways: true,
    kCGImageSourceCreateThumbnailWithTransform: true,
    kCGImageSourceThumbnailMaxPixelSize: 3000
  ]
  return CGImageSourceCreateThumbnailAtIndex(src, 0, opts as CFDictionary)
}

// Vision uses a bottom-left origin; flip to top-left.
func topLeft(_ r: CGRect) -> [Double] {
  [Double(r.minX), Double(1 - r.maxY), Double(r.width), Double(r.height)]
}

func point(_ p: CGPoint) -> [Double] { [Double(p.x), Double(1 - p.y)] }

guard CommandLine.arguments.count >= 2 else { fail("usage: vision_layout <file>") }
guard let image = loadImage(CommandLine.arguments[1]) else { fail("cannot read image") }

func makeRequest(_ level: VNRequestTextRecognitionLevel) -> VNRecognizeTextRequest {
  let request = VNRecognizeTextRequest()
  request.recognitionLevel = level
  request.usesLanguageCorrection = false
  request.minimumTextHeight = 0.008
  return request
}

// Some macOS releases ship a broken "accurate" model (e5rtError). Fall back to
// the fast recogniser, which still gives line boxes and angles. The server
// remembers the result and passes TT_VISION_LEVEL=fast to skip the slow failure.
let preferFast = ProcessInfo.processInfo.environment["TT_VISION_LEVEL"] == "fast"
var level = preferFast ? "fast" : "accurate"
var request = makeRequest(preferFast ? .fast : .accurate)
do {
  try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
} catch {
  if preferFast { fail("vision failed: \(error)") }
  level = "fast"
  request = makeRequest(.fast)
  do {
    try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
  } catch {
    fail("vision failed: \(error)")
  }
}

var lines: [[String: Any]] = []
for obs in request.results ?? [] {
  guard let candidate = obs.topCandidates(1).first else { continue }
  let text = candidate.string
  var words: [[String: Any]] = []
  text.enumerateSubstrings(in: text.startIndex..<text.endIndex, options: .byWords) { word, range, _, _ in
    guard let word = word, let box = try? candidate.boundingBox(for: range) else { return }
    words.append(["text": word, "box": topLeft(box.boundingBox)])
  }
  lines.append([
    "text": text,
    "confidence": Double(candidate.confidence),
    "box": topLeft(obs.boundingBox),
    "quad": [point(obs.topLeft), point(obs.topRight), point(obs.bottomRight), point(obs.bottomLeft)],
    "words": words
  ])
}

let out: [String: Any] = ["width": image.width, "height": image.height, "level": level, "lines": lines]
let data = try! JSONSerialization.data(withJSONObject: out, options: [])
FileHandle.standardOutput.write(data)
