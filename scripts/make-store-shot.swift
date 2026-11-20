// App Store screenshot frame: caption on the app's blue above a raw simulator screenshot (1320 x 2868, no alpha).
// Usage: swift scripts/make-store-shot.swift <raw.png> <out.png> "<caption>"
import AppKit
import CoreGraphics
import CoreText
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
guard args.count == 4,
      let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: args[1]) as CFURL, nil),
      let raw = CGImageSourceCreateImageAtIndex(src, 0, nil) else {
    FileHandle.standardError.write("usage: make-store-shot.swift raw.png out.png caption\n".data(using: .utf8)!)
    exit(1)
}
let W = 1320, H = 2868
let space = CGColorSpace(name: CGColorSpace.sRGB)!
guard let ctx = CGContext(data: nil, width: W, height: H, bitsPerComponent: 8, bytesPerRow: 0, space: space,
                          bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { exit(1) }

// background: app blue (#208AEF) fading to a deeper blue
let colors = [CGColor(red: 0.125, green: 0.541, blue: 0.937, alpha: 1), CGColor(red: 0.05, green: 0.28, blue: 0.62, alpha: 1)] as CFArray
let gradient = CGGradient(colorsSpace: space, colors: colors, locations: [0, 1])!
ctx.drawLinearGradient(gradient, start: CGPoint(x: 0, y: H), end: CGPoint(x: 0, y: 0), options: [])

// caption (top 430 px), centred, up to two lines
let font = CTFontCreateWithName("HelveticaNeue-Bold" as CFString, 88, nil)
let style = NSMutableParagraphStyle()
style.alignment = .center
style.lineSpacing = 6
let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: NSColor.white, .paragraphStyle: style]
let text = NSAttributedString(string: args[3], attributes: attrs)
let framesetter = CTFramesetterCreateWithAttributedString(text)
let box = CGRect(x: 90, y: H - 450, width: W - 180, height: 400)
let size = CTFramesetterSuggestFrameSizeWithConstraints(framesetter, CFRange(location: 0, length: 0), nil,
                                                        CGSize(width: box.width, height: box.height), nil)
let textRect = CGRect(x: box.minX, y: box.minY + (box.height - size.height) / 2, width: box.width, height: size.height)
let path = CGPath(rect: textRect, transform: nil)
CTFrameDraw(CTFramesetterCreateFrame(framesetter, CFRange(location: 0, length: 0), path, nil), ctx)

// screenshot, scaled to fit under the caption with rounded corners
let scale = 0.82
let w = Double(W) * scale, h = Double(H) * scale
let rect = CGRect(x: (Double(W) - w) / 2, y: 46, width: w, height: h)
ctx.saveGState()
ctx.addPath(CGPath(roundedRect: rect, cornerWidth: 64, cornerHeight: 64, transform: nil))
ctx.clip()
ctx.interpolationQuality = .high
ctx.draw(raw, in: rect)
ctx.restoreGState()

guard let out = ctx.makeImage(),
      let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: args[2]) as CFURL, UTType.png.identifier as CFString, 1, nil) else { exit(1) }
CGImageDestinationAddImage(dest, out, nil)
if !CGImageDestinationFinalize(dest) { exit(1) }
