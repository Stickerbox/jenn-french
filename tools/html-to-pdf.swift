// Renders a local HTML file to a paginated PDF using the system WebKit.
//
// Every other route was worse: Dia's Chromium refuses --headless, there is no
// Chrome on this machine, and cupsfilter cannot lay out CSS. WKWebView is
// already on every Mac, so this needs nothing installed.
//
//   swift html-to-pdf.swift <input.html> <output.pdf> [title]
//
// NSPrintOperation rather than WKWebView.createPDF: createPDF returns one
// enormous single page, which prints badly. This paginates onto Letter.

import Cocoa
import WebKit

let args = CommandLine.arguments
guard args.count >= 3 else {
    FileHandle.standardError.write("usage: html-to-pdf <input.html> <output.pdf>\n".data(using: .utf8)!)
    exit(2)
}

let input = URL(fileURLWithPath: args[1])
let output = URL(fileURLWithPath: args[2])

let app = NSApplication.shared
app.setActivationPolicy(.prohibited)

final class Printer: NSObject, WKNavigationDelegate {
    let output: URL
    init(output: URL) { self.output = output }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // Web fonts and images finish after didFinish fires. Printing straight
        // away yields a PDF missing whatever had not painted yet.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
            let info = NSPrintInfo.shared
            info.jobDisposition = .save
            info.dictionary()[NSPrintInfo.AttributeKey.jobSavingURL] = self.output
            info.topMargin = 36
            info.bottomMargin = 36
            info.leftMargin = 36
            info.rightMargin = 36
            info.isHorizontallyCentered = true
            info.isVerticallyCentered = false

            let operation = webView.printOperation(with: info)
            operation.showsPrintPanel = false
            operation.showsProgressPanel = false
            operation.run()

            exit(FileManager.default.fileExists(atPath: self.output.path) ? 0 : 1)
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        FileHandle.standardError.write("render failed: \(error.localizedDescription)\n".data(using: .utf8)!)
        exit(1)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        FileHandle.standardError.write("could not load: \(error.localizedDescription)\n".data(using: .utf8)!)
        exit(1)
    }
}

// 8.5in x 11in at 96dpi, so the page lays out at the width it will print at
// rather than being reflowed from some arbitrary window size.
let webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 816, height: 1056))
let printer = Printer(output: output)
webView.navigationDelegate = printer
webView.loadFileURL(input, allowingReadAccessTo: input.deletingLastPathComponent())

// A page that never finishes loading would otherwise hang the shortcut that
// called this, with nothing on screen to explain why.
DispatchQueue.main.asyncAfter(deadline: .now() + 30) {
    FileHandle.standardError.write("timed out after 30s\n".data(using: .utf8)!)
    exit(1)
}

app.run()
