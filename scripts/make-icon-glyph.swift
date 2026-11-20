// Plain Apps original app icons, drawn from CoreGraphics paths only: no SF Symbol, no font, no third-party artwork, no network.
// Same pipeline as print-cost's scripts/make-icon.swift (D91), with a flat solid background instead of a gradient and the
// glyph chosen by --design. One accent colour per icon on a solid background, readable at 60 px, no text.
// Usage: swift scripts/make-icon-glyph.swift --design <intervals|offscan|tillcard|plainweeks|mood|cardscan> [--out <app folder>]
//        swift scripts/make-icon-glyph.swift --design offscan --png <file.png>      (only a 1024 PNG, e.g. for a contact sheet)
// Writes assets/images/{icon,favicon,splash-icon,android-icon-foreground,android-icon-background,android-icon-monochrome}.png
// and assets/expo.icon/{icon.json,Assets/glyph.png}. icon.png is 1024 x 1024 without alpha (App Store rule).
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

var opts: [String: String] = [:]
var argi = 1
let args = CommandLine.arguments
while argi + 1 < args.count, args[argi].hasPrefix("--") { opts[String(args[argi].dropFirst(2))] = args[argi + 1]; argi += 2 }
func fail(_ m: String) -> Never { FileHandle.standardError.write((m + "\n").data(using: .utf8)!); exit(1) }

let space = CGColorSpace(name: CGColorSpace.sRGB)!
func rgb(_ h: UInt32, _ a: CGFloat = 1) -> CGColor {
  CGColor(colorSpace: space, components: [CGFloat((h >> 16) & 255) / 255, CGFloat((h >> 8) & 255) / 255, CGFloat(h & 255) / 255, a])!
}
func lum(_ h: UInt32) -> Double {
  func ch(_ v: UInt32) -> Double { let c = Double(v) / 255; return c <= 0.03928 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4) }
  return 0.2126 * ch((h >> 16) & 255) + 0.7152 * ch((h >> 8) & 255) + 0.0722 * ch(h & 255)
}
func contrast(_ a: UInt32, _ b: UInt32) -> Double { let x = lum(a), y = lum(b); return (max(x, y) + 0.05) / (min(x, y) + 0.05) }
func mix(_ a: UInt32, _ b: UInt32, _ t: Double) -> UInt32 {
  func c(_ s: Int) -> UInt32 { let x = Double((a >> s) & 255), y = Double((b >> s) & 255); return UInt32((x + (y - x) * t).rounded()) }
  return (c(16) << 16) | (c(8) << 8) | c(0)
}

struct Design { let name: String; let bg: UInt32; let accent: UInt32; let note: String }
let designs: [String: Design] = [
  "intervals": Design(name: "intervals", bg: 0xB43308, accent: 0xFFE082, note: "segmented ring, one segment lit"),
  "offscan": Design(name: "offscan", bg: 0x0D47A1, accent: 0x69F0AE, note: "page with a scan line"),
  "tillcard": Design(name: "tillcard", bg: 0x5E35B1, accent: 0xB2FF59, note: "stacked cards, three-bar mark"),
  "plainweeks": Design(name: "plainweeks", bg: 0x1F6F68, accent: 0xFFE9A8, note: "crescent with a leaf"),
  "mood": Design(name: "mood", bg: 0xAD1457, accent: 0xFFEB3B, note: "one calm face"),
  "cardscan": Design(name: "cardscan", bg: 0x263238, accent: 0x4DD0E1, note: "card inside corner frame"),
  // Batch 2 (2026-11-04): sky blue, forest green, brown, olive, indigo, cyan, near-black, coral.
  "breathe": Design(name: "breathe", bg: 0x4B57A6, accent: 0xFFFFFF, note: "swell over a horizon on a dusk gradient (sheet 9, R1 2026-11)"),
  "eyerest": Design(name: "eyerest", bg: 0x2E7D32, accent: 0xFFF176, note: "eye outline with a motion arc"),
  "decibel": Design(name: "decibel", bg: 0x5D4037, accent: 0xFFB74D, note: "three rising bars and a sound arc"),
  "shrink": Design(name: "shrink", bg: 0x827717, accent: 0xF4FF81, note: "photo frame with a smaller frame and an arrow"),
  "safeshare": Design(name: "safeshare", bg: 0x303F9F, accent: 0x84FFFF, note: "document with a shield mark"),
  "resume": Design(name: "resume", bg: 0x00838F, accent: 0xFFD54F, note: "page with header block and three lines"),
  "gauge": Design(name: "gauge", bg: 0x14181B, accent: 0xFF9E40, note: "round gauge with a needle"),
  "warranty": Design(name: "warranty", bg: 0xD6455D, accent: 0xFFD180, note: "two-tone shield with a check"),
]
guard let dname = opts["design"], let design = designs[dname] else { fail("--design must be one of \(designs.keys.sorted().joined(separator: ", "))") }
let white: UInt32 = 0xFFFFFF
/// Breathe only: the icon is a top-to-bottom gradient from `bg` to this colour; every other design stays solid.
let gradientBottom: UInt32? = dname == "breathe" ? 0x9EA8F0 : nil
/// Breathe only: the iOS dark variant swaps the gradient for this solid colour (the app's dark background).
let darkSolid: UInt32? = dname == "breathe" ? 0x1B1E26 : nil
func fillBackground(_ ctx: CGContext, _ size: Int) {
  let rect = CGRect(x: 0, y: 0, width: size, height: size)
  if let bottom = gradientBottom, let grad = CGGradient(colorsSpace: space, colors: [rgb(design.bg), rgb(bottom)] as CFArray, locations: [0, 1]) {
    ctx.drawLinearGradient(grad, start: CGPoint(x: 0, y: 0), end: CGPoint(x: 0, y: CGFloat(size)), options: [])
  } else {
    ctx.setFillColor(rgb(design.bg))
    ctx.fill(rect)
  }
}
print(String(format: "design %@: bg #%06X, white on bg %.2f:1, accent on bg %.2f:1", dname, design.bg, contrast(white, design.bg), contrast(design.accent, design.bg)))

/// Square canvas with a top-left origin. `opaque` = no alpha channel.
func canvas(_ size: Int, opaque: Bool = false) -> CGContext {
  let info = opaque ? CGImageAlphaInfo.noneSkipLast.rawValue : CGImageAlphaInfo.premultipliedLast.rawValue
  let ctx = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0, space: space, bitmapInfo: info)!
  ctx.translateBy(x: 0, y: CGFloat(size))
  ctx.scaleBy(x: 1, y: -1)
  return ctx
}
func save(_ image: CGImage, _ url: URL) {
  try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
  let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil)!
  CGImageDestinationAddImage(dest, image, nil)
  guard CGImageDestinationFinalize(dest) else { fail("could not write \(url.path)") }
  print("wrote \(url.path)")
}
func resized(_ image: CGImage, to size: Int, opaque: Bool = false) -> CGImage {
  let out = canvas(size, opaque: opaque)
  out.interpolationQuality = .high
  out.translateBy(x: 0, y: CGFloat(size))
  out.scaleBy(x: 1, y: -1)
  out.draw(image, in: CGRect(x: 0, y: 0, width: size, height: size))
  return out.makeImage()!
}

// ---------- path helpers (design space 1000 x 1000, y down) ----------
func roundedPolygon(_ pts: [CGPoint], _ r: CGFloat) -> CGPath {
  let p = CGMutablePath()
  let n = pts.count
  p.move(to: CGPoint(x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2))
  for k in 1...n { p.addArc(tangent1End: pts[k % n], tangent2End: pts[(k + 1) % n], radius: r) }
  p.closeSubpath()
  return p
}
func rrect(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat, _ r: CGFloat) -> CGPath {
  CGPath(roundedRect: CGRect(x: x, y: y, width: w, height: h), cornerWidth: r, cornerHeight: r, transform: nil)
}
/// Annular sector from angle a0 to a1 (degrees, 0 = up, clockwise), sampled as a polygon (no arc-direction ambiguity).
func sector(_ c: CGPoint, _ r0: CGFloat, _ r1: CGFloat, _ a0: Double, _ a1: Double) -> CGPath {
  let p = CGMutablePath()
  func pt(_ r: CGFloat, _ a: Double) -> CGPoint { CGPoint(x: c.x + r * CGFloat(sin(a * .pi / 180)), y: c.y - r * CGFloat(cos(a * .pi / 180))) }
  let steps = max(2, Int((a1 - a0) / 1.5))
  p.move(to: pt(r1, a0))
  for s in 1...steps { p.addLine(to: pt(r1, a0 + (a1 - a0) * Double(s) / Double(steps))) }
  for s in 0...steps { p.addLine(to: pt(r0, a1 - (a1 - a0) * Double(s) / Double(steps))) }
  p.closeSubpath()
  return p
}
/// Fills a path with rounded corners by also stroking it with a round join (path was built `k` smaller on each side).
func fillRounded(_ ctx: CGContext, _ path: CGPath, _ k: CGFloat, _ colour: CGColor) {
  ctx.saveGState()
  ctx.addPath(path)
  ctx.setFillColor(colour)
  ctx.setStrokeColor(colour)
  ctx.setLineWidth(k * 2)
  ctx.setLineJoin(.round)
  ctx.drawPath(using: .fillStroke)
  ctx.restoreGState()
}
func clear(_ ctx: CGContext, _ path: CGPath) {
  ctx.saveGState()
  ctx.setBlendMode(.clear)
  ctx.addPath(path)
  ctx.fillPath()
  ctx.restoreGState()
}
/// Punches a gap of `halo` around `path` (a stroked outline), so overlapping shapes read as separate layers.
func clearHalo(_ ctx: CGContext, _ path: CGPath, _ halo: CGFloat) {
  ctx.saveGState()
  ctx.setBlendMode(.clear)
  ctx.setLineWidth(halo * 2)
  ctx.setLineJoin(.round)
  ctx.addPath(path)
  ctx.setStrokeColor(rgb(0))
  ctx.strokePath()
  ctx.addPath(path)
  ctx.fillPath()
  ctx.restoreGState()
}

enum Look { case colour, mono }

func drawGlyph(_ ctx: CGContext, box: CGRect, _ look: Look) {
  ctx.saveGState()
  ctx.translateBy(x: box.minX, y: box.minY)
  ctx.scaleBy(x: box.width / 1000, y: box.height / 1000)
  let main = rgb(white)
  let acc = look == .colour ? rgb(design.accent) : rgb(white)
  switch design.name {
  case "intervals":
    // Eight segments of a ring (a round of work); the one at the top right, the current interval, is thicker and lit.
    let c = CGPoint(x: 500, y: 500)
    let k: CGFloat = 14
    for i in 0..<8 {
      let a0 = Double(i) * 45 + 3.5, a1 = Double(i + 1) * 45 - 3.5
      let lit = i == 0
      let path = lit ? sector(c, 205 + k, 395 - k, a0 + 1, a1 - 1) : sector(c, 245 + k, 365 - k, a0 + 2, a1 - 2)
      fillRounded(ctx, path, k, lit ? acc : main)
    }
  case "offscan":
    // A page with a cut corner and a fold, and a scan line crossing it (it sticks out on both sides).
    let page = roundedPolygon([CGPoint(x: 270, y: 130), CGPoint(x: 560, y: 130), CGPoint(x: 730, y: 300), CGPoint(x: 730, y: 870), CGPoint(x: 270, y: 870)], 34)
    ctx.addPath(page)
    ctx.setFillColor(main)
    ctx.fillPath()
    if look == .colour {
      let fold = roundedPolygon([CGPoint(x: 560, y: 130), CGPoint(x: 730, y: 300), CGPoint(x: 560, y: 300)], 10)
      ctx.addPath(fold)
      ctx.setFillColor(rgb(mix(white, design.bg, 0.55)))
      ctx.fillPath()
    }
    let bar = rrect(150, 500, 700, 56, 28)
    clearHalo(ctx, bar, 24)
    ctx.addPath(bar)
    ctx.setFillColor(acc)
    ctx.fillPath()
  case "tillcard":
    // Two stacked cards; the front one carries a three-bar mark (punched through).
    ctx.saveGState()
    ctx.translateBy(x: 560, y: 405)
    ctx.rotate(by: -0.17)
    ctx.addPath(rrect(-320, -200, 640, 400, 56))
    ctx.setFillColor(acc)
    ctx.fillPath()
    ctx.restoreGState()
    let front = rrect(140, 425, 640, 410, 56)
    clearHalo(ctx, front, 26)
    ctx.addPath(front)
    ctx.setFillColor(main)
    ctx.fillPath()
    for (x, w) in [(300.0, 52.0), (404.0, 112.0), (568.0, 52.0)] { clear(ctx, rrect(CGFloat(x), 515, CGFloat(w), 230, 14)) }
  case "plainweeks":
    // A crescent, with a leaf growing in its opening. Nothing that says pregnancy.
    let outer = CGPath(ellipseIn: CGRect(x: 160, y: 200, width: 680, height: 680), transform: nil)
    let inner = CGPath(ellipseIn: CGRect(x: 290, y: 130, width: 600, height: 600), transform: nil)
    ctx.addPath(outer)
    ctx.setFillColor(main)
    ctx.fillPath()
    clear(ctx, inner)
    let leaf = CGMutablePath()
    let base = CGPoint(x: 520, y: 640), tip = CGPoint(x: 740, y: 290)
    leaf.move(to: base)
    leaf.addQuadCurve(to: tip, control: CGPoint(x: 460, y: 380))
    leaf.addQuadCurve(to: base, control: CGPoint(x: 780, y: 580))
    leaf.closeSubpath()
    ctx.addPath(leaf)
    ctx.setFillColor(acc)
    ctx.fillPath()
  case "mood":
    // One calm face (the app's home asks "How are you?"): a lit disc, two eyes and a smile punched through.
    ctx.addPath(CGPath(ellipseIn: CGRect(x: 140, y: 140, width: 720, height: 720), transform: nil))
    ctx.setFillColor(acc)
    ctx.fillPath()
    clear(ctx, CGPath(ellipseIn: CGRect(x: 322, y: 360, width: 92, height: 124), transform: nil))
    clear(ctx, CGPath(ellipseIn: CGRect(x: 586, y: 360, width: 92, height: 124), transform: nil))
    let smile = CGMutablePath()
    for s in 0...40 {
      let a = (30.0 + 120.0 * Double(s) / 40) * .pi / 180
      let p = CGPoint(x: 500 + 215 * CGFloat(cos(a)), y: 470 + 215 * CGFloat(sin(a)))
      if s == 0 { smile.move(to: p) } else { smile.addLine(to: p) }
    }
    ctx.saveGState()
    ctx.setBlendMode(.clear)
    ctx.addPath(smile)
    ctx.setLineWidth(62)
    ctx.setLineCap(.round)
    ctx.setLineJoin(.round)
    ctx.setStrokeColor(rgb(0))
    ctx.strokePath()
    ctx.restoreGState()
  case "cardscan":
    // A card inside four scanner corners.
    let card = rrect(240, 350, 520, 330, 44)
    ctx.addPath(card)
    ctx.setFillColor(main)
    ctx.fillPath()
    clear(ctx, rrect(296, 410, 86, 66, 14))
    clear(ctx, rrect(296, 560, 280, 36, 18))
    let l: CGFloat = 170, t: CGFloat = 54
    let x0: CGFloat = 130, x1: CGFloat = 870, y0: CGFloat = 215, y1: CGFloat = 815
    let corner = CGMutablePath()
    corner.move(to: CGPoint(x: x0, y: y0 + l)); corner.addLine(to: CGPoint(x: x0, y: y0)); corner.addLine(to: CGPoint(x: x0 + l, y: y0))
    corner.move(to: CGPoint(x: x1 - l, y: y0)); corner.addLine(to: CGPoint(x: x1, y: y0)); corner.addLine(to: CGPoint(x: x1, y: y0 + l))
    corner.move(to: CGPoint(x: x1, y: y1 - l)); corner.addLine(to: CGPoint(x: x1, y: y1)); corner.addLine(to: CGPoint(x: x1 - l, y: y1))
    corner.move(to: CGPoint(x: x0 + l, y: y1)); corner.addLine(to: CGPoint(x: x0, y: y1)); corner.addLine(to: CGPoint(x: x0, y: y1 - l))
    ctx.addPath(corner)
    ctx.setStrokeColor(acc)
    ctx.setLineWidth(t)
    ctx.setLineCap(.round)
    ctx.setLineJoin(.round)
    ctx.strokePath()
  case "breathe":
    // One smooth swell (rise, short flat top, fall) as a single line over a thin horizon, a dot at the crest. No ring.
    let horizon = CGMutablePath()
    horizon.move(to: CGPoint(x: 125, y: 719)); horizon.addLine(to: CGPoint(x: 875, y: 719))
    ctx.addPath(horizon)
    ctx.setStrokeColor(look == .colour ? rgb(white, 0.6) : rgb(white))
    ctx.setLineWidth(26)
    ctx.setLineCap(.round)
    ctx.strokePath()
    let swell = CGMutablePath()
    swell.move(to: CGPoint(x: 125, y: 656))
    swell.addCurve(to: CGPoint(x: 438, y: 344), control1: CGPoint(x: 281, y: 656), control2: CGPoint(x: 313, y: 344))
    swell.addLine(to: CGPoint(x: 563, y: 344))
    swell.addCurve(to: CGPoint(x: 875, y: 656), control1: CGPoint(x: 688, y: 344), control2: CGPoint(x: 719, y: 656))
    ctx.addPath(swell)
    ctx.setStrokeColor(main)
    ctx.setLineWidth(52)
    ctx.setLineJoin(.round)
    ctx.strokePath()
    ctx.addPath(CGPath(ellipseIn: CGRect(x: 500 - 58, y: 344 - 58, width: 116, height: 116), transform: nil))
    ctx.setFillColor(main)
    ctx.fillPath()
  case "eyerest":
    // An almond eye outline with an iris, and a small arc with an arrowhead above it (the eye moves).
    let eye = CGMutablePath()
    eye.move(to: CGPoint(x: 110, y: 560))
    eye.addQuadCurve(to: CGPoint(x: 890, y: 560), control: CGPoint(x: 500, y: 190))
    eye.addQuadCurve(to: CGPoint(x: 110, y: 560), control: CGPoint(x: 500, y: 930))
    eye.closeSubpath()
    ctx.addPath(eye)
    ctx.setStrokeColor(main)
    ctx.setLineWidth(54)
    ctx.setLineJoin(.round)
    ctx.strokePath()
    ctx.addPath(CGPath(ellipseIn: CGRect(x: 500 - 118, y: 560 - 118, width: 236, height: 236), transform: nil))
    ctx.setFillColor(acc)
    ctx.fillPath()
    clear(ctx, CGPath(ellipseIn: CGRect(x: 500 - 46, y: 560 - 46, width: 92, height: 92), transform: nil))
    let c0 = CGPoint(x: 500, y: 560), rr: CGFloat = 430
    func ap(_ a: Double) -> CGPoint { CGPoint(x: c0.x + rr * CGFloat(sin(a * .pi / 180)), y: c0.y - rr * CGFloat(cos(a * .pi / 180))) }
    let arc = CGMutablePath()
    arc.move(to: ap(-42))
    for s in 1...30 { arc.addLine(to: ap(-42 + 66 * Double(s) / 30)) }
    ctx.addPath(arc)
    ctx.setStrokeColor(acc)
    ctx.setLineWidth(46)
    ctx.setLineCap(.round)
    ctx.strokePath()
    let endA = 24.0 * Double.pi / 180
    let tip = CGPoint(x: ap(24).x + 70 * CGFloat(cos(endA)), y: ap(24).y + 70 * CGFloat(sin(endA)))
    let nrm = CGPoint(x: -CGFloat(sin(endA)), y: CGFloat(cos(endA)))
    let head = roundedPolygon([tip, CGPoint(x: ap(24).x + 55 * nrm.x, y: ap(24).y + 55 * nrm.y), CGPoint(x: ap(24).x - 55 * nrm.x, y: ap(24).y - 55 * nrm.y)], 8)
    ctx.addPath(head)
    ctx.setFillColor(acc)
    ctx.fillPath()
  case "decibel":
    // Three rising bars, and a small sound arc beside the tallest.
    for (x, h) in [(150.0, 230.0), (310.0, 380.0), (470.0, 530.0)] {
      ctx.addPath(rrect(CGFloat(x), 810 - CGFloat(h), 130, CGFloat(h), 34))
      ctx.setFillColor(main)
      ctx.fillPath()
    }
    let wave = CGMutablePath()
    let wc = CGPoint(x: 660, y: 330)
    for s in 0...30 {
      let a = (35.0 + 110.0 * Double(s) / 30) * .pi / 180
      let p = CGPoint(x: wc.x + 150 * CGFloat(sin(a)), y: wc.y - 150 * CGFloat(cos(a)))
      if s == 0 { wave.move(to: p) } else { wave.addLine(to: p) }
    }
    ctx.addPath(wave)
    ctx.setStrokeColor(acc)
    ctx.setLineWidth(52)
    ctx.setLineCap(.round)
    ctx.strokePath()
  case "shrink":
    // A photo frame (outline) with a smaller solid frame in its lower left, and an arrow pointing down and left into it.
    ctx.addPath(rrect(150, 130, 700, 700, 100))
    ctx.setStrokeColor(main)
    ctx.setLineWidth(58)
    ctx.strokePath()
    ctx.addPath(rrect(250, 460, 270, 270, 52))
    ctx.setFillColor(acc)
    ctx.fillPath()
    let shaft = CGMutablePath()
    shaft.move(to: CGPoint(x: 700, y: 270)); shaft.addLine(to: CGPoint(x: 600, y: 370))
    ctx.addPath(shaft)
    ctx.setStrokeColor(main)
    ctx.setLineWidth(52)
    ctx.setLineCap(.round)
    ctx.strokePath()
    ctx.addPath(roundedPolygon([CGPoint(x: 530, y: 440), CGPoint(x: 662, y: 396), CGPoint(x: 574, y: 308)], 10))
    ctx.setFillColor(main)
    ctx.fillPath()
  case "safeshare":
    // A page (two text lines punched in) with a shield on its lower right corner, a check punched through the shield.
    let page = roundedPolygon([CGPoint(x: 210, y: 120), CGPoint(x: 520, y: 120), CGPoint(x: 700, y: 300), CGPoint(x: 700, y: 880), CGPoint(x: 210, y: 880)], 34)
    ctx.addPath(page)
    ctx.setFillColor(main)
    ctx.fillPath()
    clear(ctx, rrect(290, 330, 200, 42, 21))
    clear(ctx, rrect(290, 440, 280, 42, 21))
    let shield = CGMutablePath()
    shield.move(to: CGPoint(x: 560, y: 520))
    shield.addLine(to: CGPoint(x: 700, y: 465))
    shield.addLine(to: CGPoint(x: 840, y: 520))
    shield.addLine(to: CGPoint(x: 840, y: 690))
    shield.addQuadCurve(to: CGPoint(x: 700, y: 890), control: CGPoint(x: 840, y: 820))
    shield.addQuadCurve(to: CGPoint(x: 560, y: 690), control: CGPoint(x: 560, y: 820))
    shield.closeSubpath()
    clearHalo(ctx, shield, 26)
    ctx.addPath(shield)
    ctx.setFillColor(acc)
    ctx.fillPath()
    let tick = CGMutablePath()
    tick.move(to: CGPoint(x: 636, y: 690)); tick.addLine(to: CGPoint(x: 685, y: 738)); tick.addLine(to: CGPoint(x: 770, y: 630))
    ctx.saveGState()
    ctx.setBlendMode(.clear)
    ctx.addPath(tick)
    ctx.setLineWidth(40)
    ctx.setLineCap(.round)
    ctx.setLineJoin(.round)
    ctx.setStrokeColor(rgb(0))
    ctx.strokePath()
    ctx.restoreGState()
  case "resume":
    // A page: an accent header block, then three text lines punched through.
    ctx.addPath(rrect(250, 120, 500, 760, 54))
    ctx.setFillColor(main)
    ctx.fillPath()
    ctx.addPath(rrect(320, 200, 360, 130, 28))
    ctx.setFillColor(acc)
    ctx.fillPath()
    clear(ctx, rrect(320, 420, 360, 46, 23))
    clear(ctx, rrect(320, 540, 360, 46, 23))
    clear(ctx, rrect(320, 660, 220, 46, 23))
  case "gauge":
    // A three-quarter dial with a needle and a hub.
    let gc = CGPoint(x: 500, y: 530)
    let dial = CGMutablePath()
    for s in 0...60 {
      let a = (-135.0 + 270.0 * Double(s) / 60) * .pi / 180
      let p = CGPoint(x: gc.x + 345 * CGFloat(sin(a)), y: gc.y - 345 * CGFloat(cos(a)))
      if s == 0 { dial.move(to: p) } else { dial.addLine(to: p) }
    }
    ctx.addPath(dial)
    ctx.setStrokeColor(main)
    ctx.setLineWidth(76)
    ctx.setLineCap(.round)
    ctx.strokePath()
    let na = 38.0 * Double.pi / 180
    let dir = CGPoint(x: CGFloat(sin(na)), y: -CGFloat(cos(na))), side = CGPoint(x: CGFloat(cos(na)), y: CGFloat(sin(na)))
    let needle = roundedPolygon([
      CGPoint(x: gc.x + dir.x * 290, y: gc.y + dir.y * 290),
      CGPoint(x: gc.x + side.x * 40, y: gc.y + side.y * 40),
      CGPoint(x: gc.x - side.x * 40, y: gc.y - side.y * 40),
    ], 14)
    ctx.addPath(needle)
    ctx.setFillColor(acc)
    ctx.fillPath()
    ctx.addPath(CGPath(ellipseIn: CGRect(x: gc.x - 48, y: gc.y - 48, width: 96, height: 96), transform: nil))
    ctx.setFillColor(main)
    ctx.fillPath()
  case "warranty":
    // A shield in two tones (left white, right lit) with a small check punched through it.
    let top = CGPoint(x: 500, y: 130)
    let left = CGMutablePath()
    left.move(to: top)
    left.addLine(to: CGPoint(x: 205, y: 235))
    left.addLine(to: CGPoint(x: 205, y: 520))
    left.addQuadCurve(to: CGPoint(x: 500, y: 880), control: CGPoint(x: 205, y: 760))
    left.closeSubpath()
    let right = CGMutablePath()
    right.move(to: top)
    right.addLine(to: CGPoint(x: 795, y: 235))
    right.addLine(to: CGPoint(x: 795, y: 520))
    right.addQuadCurve(to: CGPoint(x: 500, y: 880), control: CGPoint(x: 795, y: 760))
    right.closeSubpath()
    fillRounded(ctx, left, 0, main)
    fillRounded(ctx, right, 0, acc)
    let tick = CGMutablePath()
    tick.move(to: CGPoint(x: 395, y: 500)); tick.addLine(to: CGPoint(x: 475, y: 580)); tick.addLine(to: CGPoint(x: 625, y: 400))
    ctx.saveGState()
    ctx.setBlendMode(.clear)
    ctx.addPath(tick)
    ctx.setLineWidth(62)
    ctx.setLineCap(.round)
    ctx.setLineJoin(.round)
    ctx.setStrokeColor(rgb(0))
    ctx.strokePath()
    ctx.restoreGState()
  default: fail("unknown design")
  }
  ctx.restoreGState()
}

func glyphLayer(_ size: Int, fraction: CGFloat, _ look: Look) -> CGContext {
  let ctx = canvas(size)
  let s = CGFloat(size), box = s * fraction
  drawGlyph(ctx, box: CGRect(x: (s - box) / 2, y: (s - box) / 2, width: box, height: box), look)
  return ctx
}
func solid(_ size: Int) -> CGImage {
  let c = canvas(size, opaque: true)
  fillBackground(c, size)
  return c.makeImage()!
}
let storeIcon: CGImage = {
  let ctx = canvas(1024, opaque: true)
  fillBackground(ctx, 1024)
  let layer = glyphLayer(1024, fraction: 0.9, .colour).makeImage()!
  ctx.translateBy(x: 0, y: 1024)
  ctx.scaleBy(x: 1, y: -1)
  ctx.draw(layer, in: CGRect(x: 0, y: 0, width: 1024, height: 1024))
  return ctx.makeImage()!
}()

if let png = opts["png"] {
  save(storeIcon, URL(fileURLWithPath: png))
  exit(0)
}

let root = URL(fileURLWithPath: opts["out"] ?? FileManager.default.currentDirectoryPath)
let images = root.appendingPathComponent("assets/images")
let bundle = root.appendingPathComponent("assets/expo.icon")
let iconAssets = bundle.appendingPathComponent("Assets")
for dir in [images, iconAssets] { try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true) }

save(storeIcon, images.appendingPathComponent("icon.png"))
save(resized(storeIcon, to: 48, opaque: true), images.appendingPathComponent("favicon.png"))
// Android adaptive layers: 108 dp canvas, 66 % safe zone; the drawing covers about 80 % of its box, so a 0.78 box keeps it inside.
save(glyphLayer(1024, fraction: 0.74, .colour).makeImage()!, images.appendingPathComponent("android-icon-foreground.png"))
save(solid(1024), images.appendingPathComponent("android-icon-background.png"))
save(glyphLayer(1024, fraction: 0.74, .mono).makeImage()!, images.appendingPathComponent("android-icon-monochrome.png"))
// Splash: the glyph alone on transparent; the splash background colour in app.config.ts is the icon colour.
save(glyphLayer(1024, fraction: 0.9, .colour).makeImage()!, images.appendingPathComponent("splash-icon.png"))
// iOS 26 Icon Composer bundle (app.config.ts ios.icon): the transparent glyph layer over a solid fill.
save(glyphLayer(1024, fraction: 0.9, .colour).makeImage()!, iconAssets.appendingPathComponent("glyph.png"))
let r = String(format: "%.5f", Double((design.bg >> 16) & 255) / 255)
let g = String(format: "%.5f", Double((design.bg >> 8) & 255) / 255)
let b = String(format: "%.5f", Double(design.bg & 255) / 255)
func srgbString(_ h: UInt32) -> String {
  String(format: "%.5f,%.5f,%.5f,1.00000", Double((h >> 16) & 255) / 255, Double((h >> 8) & 255) / 255, Double(h & 255) / 255)
}
var fillJSON = "\"solid\" : \"extended-srgb:\(r),\(g),\(b),1.00000\""
var specJSON = ""
if let bottom = gradientBottom {
  fillJSON = "\"linear-gradient\" : [ \"srgb:\(srgbString(design.bg))\", \"srgb:\(srgbString(bottom))\" ], \"orientation\" : { \"start\" : { \"x\" : 0.5, \"y\" : 0 }, \"stop\" : { \"x\" : 0.5, \"y\" : 1 } }"
}
if let dark = darkSolid {
  specJSON = "  \"fill-specializations\" : [\n    { \"value\" : \"automatic\" },\n    { \"appearance\" : \"dark\", \"value\" : { \"solid\" : \"srgb:\(srgbString(dark))\" } }\n  ],\n"
}
let json = """
{
  "fill" : {
    \(fillJSON)
  },
\(specJSON)  "groups" : [
    {
      "layers" : [
        {
          "image-name" : "glyph.png",
          "name" : "glyph"
        }
      ],
      "shadow" : {
        "kind" : "neutral",
        "opacity" : 0.5
      },
      "translucency" : {
        "enabled" : true,
        "value" : 0.5
      }
    }
  ],
  "supported-platforms" : {
    "circles" : [
      "watchOS"
    ],
    "squares" : "shared"
  }
}

"""
try json.write(to: bundle.appendingPathComponent("icon.json"), atomically: true, encoding: .utf8)
print("wrote assets/expo.icon/icon.json")
