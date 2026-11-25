import Flutter
import UIKit
import UniformTypeIdentifiers
import PDFKit

@main
@objc class AppDelegate: FlutterAppDelegate,
  FlutterImplicitEngineDelegate,
  UIImagePickerControllerDelegate,
  UINavigationControllerDelegate,
  UIDocumentPickerDelegate
{
  private var filePickerChannel: FlutterMethodChannel?
  private var pendingResult: FlutterResult?

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    let launched = super.application(application, didFinishLaunchingWithOptions: launchOptions)
    if let controller = window?.rootViewController as? FlutterViewController {
      setupMethodChannel(messenger: controller.binaryMessenger)
    }
    return launched
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    if let registrar = engineBridge.pluginRegistry.registrar(forPlugin: "TrustTraceNativeFilePickerPlugin") {
      setupMethodChannel(messenger: registrar.messenger())
    }
  }

  private func setupMethodChannel(messenger: FlutterBinaryMessenger) {
    if filePickerChannel != nil { return }
    let channel = FlutterMethodChannel(
      name: "trusttrace/file_picker",
      binaryMessenger: messenger
    )
    channel.setMethodCallHandler { [weak self] (call: FlutterMethodCall, result: @escaping FlutterResult) in
      guard let self = self else {
        result(FlutterError(code: "UNAVAILABLE", message: "AppDelegate deallocated", details: nil))
        return
      }
      DispatchQueue.main.async {
        switch call.method {
        case "pickFromCamera":
          self.presentImagePicker(preferCamera: true, result: result)
        case "pickFromGallery":
          self.presentImagePicker(preferCamera: false, result: result)
        case "pickFromFiles":
          self.presentDocumentPicker(result: result)
        case "hasUrlScheme":
          // Google Sign-In raises an uncatchable exception when its URL scheme
          // is missing, so Dart asks first.
          let wanted = (call.arguments as? String ?? "").lowercased()
          let types = Bundle.main.object(forInfoDictionaryKey: "CFBundleURLTypes") as? [[String: Any]] ?? []
          let schemes = types.flatMap { ($0["CFBundleURLSchemes"] as? [String]) ?? [] }.map { $0.lowercased() }
          result(!wanted.isEmpty && schemes.contains(wanted))
        case "interfaceOrientation":
          result(self.interfaceOrientationName())
        default:
          result(FlutterMethodNotImplemented)
        }
      }
    }
    self.filePickerChannel = channel
  }

  private func topViewController() -> UIViewController? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    let keyWindow = scenes.flatMap { $0.windows }.first(where: { $0.isKeyWindow })
      ?? scenes.flatMap { $0.windows }.first
      ?? self.window
    var top = keyWindow?.rootViewController
    while let presented = top?.presentedViewController {
      top = presented
    }
    return top
  }

  /// How the app's window is currently shown, named like Flutter's
  /// DeviceOrientation. The document camera locks its capture orientation to
  /// this so the preview and photo match the screen on iPad and rotated iPhones.
  /// UIInterfaceOrientation.landscapeLeft is the device turned to the right
  /// (UIDeviceOrientation.landscapeRight), hence the swap below.
  private func interfaceOrientationName() -> String {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    guard let scene = scenes.first(where: { $0.activationState == .foregroundActive }) ?? scenes.first else {
      return "portraitUp"
    }
    let orientation: UIInterfaceOrientation
    if #available(iOS 16.0, *) {
      orientation = scene.effectiveGeometry.interfaceOrientation
    } else {
      orientation = scene.interfaceOrientation
    }
    switch orientation {
    case .landscapeLeft: return "landscapeRight"
    case .landscapeRight: return "landscapeLeft"
    case .portraitUpsideDown: return "portraitDown"
    default: return "portraitUp"
    }
  }

  private func presentImagePicker(preferCamera: Bool, result: @escaping FlutterResult) {
    guard let presenter = topViewController() else {
      result(FlutterError(code: "NO_VIEW_CONTROLLER", message: "Unable to find active iOS view controller", details: nil))
      return
    }
    self.pendingResult = result
    let picker = UIImagePickerController()
    picker.delegate = self
    picker.allowsEditing = false
    if preferCamera && UIImagePickerController.isSourceTypeAvailable(.camera) {
      picker.sourceType = .camera
      picker.cameraCaptureMode = .photo
    } else {
      picker.sourceType = .photoLibrary
    }
    presenter.present(picker, animated: true, completion: nil)
  }

  private func presentDocumentPicker(result: @escaping FlutterResult) {
    guard let presenter = topViewController() else {
      result(FlutterError(code: "NO_VIEW_CONTROLLER", message: "Unable to find active iOS view controller", details: nil))
      return
    }
    self.pendingResult = result
    let supportedTypes: [UTType] = [.pdf, .png, .jpeg]
    let docPicker = UIDocumentPickerViewController(forOpeningContentTypes: supportedTypes, asCopy: true)
    docPicker.delegate = self
    docPicker.allowsMultipleSelection = false
    presenter.present(docPicker, animated: true, completion: nil)
  }

  // MARK: - UIImagePickerControllerDelegate

  func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
    picker.dismiss(animated: true) { [weak self] in
      self?.pendingResult?(nil)
      self?.pendingResult = nil
    }
  }

  func imagePickerController(
    _ picker: UIImagePickerController,
    didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
  ) {
    let pickedImage = (info[.editedImage] as? UIImage) ?? (info[.originalImage] as? UIImage)
    let imageUrl = info[.imageURL] as? URL
    let isCamera = picker.sourceType == .camera

    picker.dismiss(animated: true) { [weak self] in
      guard let self = self else { return }
      guard let rawImage = pickedImage else {
        self.pendingResult?(nil)
        self.pendingResult = nil
        return
      }

      let normalized = self.normalizeImageOrientation(rawImage)
      let width = Int(normalized.size.width * normalized.scale)
      let height = Int(normalized.size.height * normalized.scale)

      guard let jpegData = normalized.jpegData(compressionQuality: 0.88) else {
        self.pendingResult?(nil)
        self.pendingResult = nil
        return
      }

      let timestamp = Int(Date().timeIntervalSince1970)
      let fileName = imageUrl?.lastPathComponent ?? (isCamera ? "Camera_Certificate_\(timestamp).jpg" : "Photo_Certificate_\(timestamp).jpg")
      let tempURL = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent(fileName)
      try? jpegData.write(to: tempURL)

      let b64 = jpegData.base64EncodedString()
      let dataUrl = "data:image/jpeg;base64,\(b64)"
      let pixelMetrics = self.computePixelMetrics(from: normalized, width: width, height: height)

      let payload: [String: Any] = [
        "fileName": fileName,
        "filePath": tempURL.path,
        "base64Data": dataUrl,
        "previewBase64": b64,
        "width": width,
        "height": height,
        "mimeType": "image/jpeg",
        "clientPixelMetrics": pixelMetrics
      ]
      self.pendingResult?(payload)
      self.pendingResult = nil
    }
  }

  // MARK: - UIDocumentPickerDelegate

  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    pendingResult?(nil)
    pendingResult = nil
  }

  func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
    guard let url = urls.first else {
      pendingResult?(nil)
      pendingResult = nil
      return
    }

    let scoped = url.startAccessingSecurityScopedResource()
    defer {
      if scoped { url.stopAccessingSecurityScopedResource() }
    }

    do {
      let data = try Data(contentsOf: url)
      let fileName = url.lastPathComponent
      let ext = url.pathExtension.lowercased()
      let mimeType: String
      if ext == "pdf" {
        mimeType = "application/pdf"
      } else if ext == "png" {
        mimeType = "image/png"
      } else {
        mimeType = "image/jpeg"
      }

      let b64 = data.base64EncodedString()
      let dataUrl = "data:\(mimeType);base64,\(b64)"

      var width = 842
      var height = 595
      var previewB64 = ""
      var pixelMetrics: [String: Any] = [
        "width": 842,
        "height": 595,
        "is3dMockup": false,
        "perimeterStudioRatio": 0.0,
        "perimeterWhiteRatio": 0.92,
        "centerWhiteRatio": 0.88
      ]

      if ext == "pdf" {
        if let pdfDoc = PDFDocument(data: data), let firstPage = pdfDoc.page(at: 0) {
          let pageRect = firstPage.bounds(for: .mediaBox)
          width = Int(max(pageRect.width, 595))
          height = Int(max(pageRect.height, 842))
          let thumbImg = firstPage.thumbnail(of: CGSize(width: 900, height: 900), for: .mediaBox)
          if let thumbJpg = thumbImg.jpegData(compressionQuality: 0.85) {
            previewB64 = thumbJpg.base64EncodedString()
          }
          pixelMetrics = self.computePixelMetrics(from: thumbImg, width: width, height: height)
        }
      } else if let img = UIImage(data: data) {
        let normalized = self.normalizeImageOrientation(img)
        width = Int(normalized.size.width * normalized.scale)
        height = Int(normalized.size.height * normalized.scale)
        if let previewJpg = normalized.jpegData(compressionQuality: 0.85) {
          previewB64 = previewJpg.base64EncodedString()
        } else {
          previewB64 = b64
        }
        pixelMetrics = self.computePixelMetrics(from: normalized, width: width, height: height)
      }

      let payload: [String: Any] = [
        "fileName": fileName,
        "filePath": url.path,
        "base64Data": dataUrl,
        "previewBase64": previewB64,
        "width": width,
        "height": height,
        "mimeType": mimeType,
        "clientPixelMetrics": pixelMetrics
      ]
      pendingResult?(payload)
      pendingResult = nil
    } catch {
      pendingResult?(FlutterError(code: "FILE_READ_ERROR", message: error.localizedDescription, details: nil))
      pendingResult = nil
    }
  }

  // MARK: - Image Orientation & Gate 1 Pixel Forensics Helper

  private func normalizeImageOrientation(_ image: UIImage) -> UIImage {
    if image.imageOrientation == .up { return image }
    UIGraphicsBeginImageContextWithOptions(image.size, false, image.scale)
    image.draw(in: CGRect(origin: .zero, size: image.size))
    let normalized = UIGraphicsGetImageFromCurrentImageContext() ?? image
    UIGraphicsEndImageContext()
    return normalized
  }

  private func computePixelMetrics(from image: UIImage, width: Int, height: Int) -> [String: Any] {
    let sampleW = 120
    let sampleH = 120
    guard let cgImage = image.cgImage else {
      return [
        "width": width,
        "height": height,
        "is3dMockup": false
      ]
    }

    let bytesPerPixel = 4
    let bytesPerRow = sampleW * bytesPerPixel
    var rawData = [UInt8](repeating: 0, count: sampleH * bytesPerRow)
    let colorSpace = CGColorSpaceCreateDeviceRGB()

    guard let context = CGContext(
      data: &rawData,
      width: sampleW,
      height: sampleH,
      bitsPerComponent: 8,
      bytesPerRow: bytesPerRow,
      space: colorSpace,
      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) else {
      return ["width": width, "height": height, "is3dMockup": false]
    }

    context.draw(cgImage, in: CGRect(x: 0, y: 0, width: sampleW, height: sampleH))

    var perimCount = 0
    var perimWhite = 0
    var perimStudio = 0
    var centerCount = 0
    var centerWhite = 0

    for y in 0..<sampleH {
      for x in 0..<sampleW {
        let idx = (y * sampleW + x) * 4
        let r = Int(rawData[idx])
        let g = Int(rawData[idx + 1])
        let b = Int(rawData[idx + 2])

        let isWhitePaper = r > 222 && g > 222 && b > 215 && abs(r - b) < 25
        let isBeigeOrTableStudio = (r > 165 && g > 150 && b > 130 && r < 232 && (r - b) >= 8)
          || (r > 95 && r < 215 && abs(r - g) < 18 && abs(g - b) < 18 && !isWhitePaper)

        let inPerimeter = x < 12 || x >= (sampleW - 12) || y < 12 || y >= (sampleH - 12)
        let inCenter = x >= 24 && x < (sampleW - 24) && y >= 24 && y < (sampleH - 24)

        if inPerimeter {
          perimCount += 1
          if isWhitePaper { perimWhite += 1 }
          if isBeigeOrTableStudio { perimStudio += 1 }
        } else if inCenter {
          centerCount += 1
          if isWhitePaper { centerWhite += 1 }
        }
      }
    }

    let perimWhiteRatio = Double(perimWhite) / Double(max(1, perimCount))
    let perimStudioRatio = Double(perimStudio) / Double(max(1, perimCount))
    let centerWhiteRatio = Double(centerWhite) / Double(max(1, centerCount))
    let is3dMockup = perimStudioRatio >= 0.78 && perimWhiteRatio < 0.08 && centerWhiteRatio >= 0.40

    return [
      "width": width,
      "height": height,
      "perimeterWhiteRatio": perimWhiteRatio,
      "perimeterStudioRatio": perimStudioRatio,
      "centerWhiteRatio": centerWhiteRatio,
      "is3dMockup": is3dMockup
    ]
  }
}
