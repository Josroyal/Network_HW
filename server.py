import os
import sys
import json
import mimetypes
import base64
import urllib.request
import urllib.parse
from http.server import HTTPServer, BaseHTTPRequestHandler

# 1x1 transparent PNG image in base64 format
TRANSPARENT_PNG_BASE64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)
TRANSPARENT_PNG_BYTES = base64.b64decode(TRANSPARENT_PNG_BASE64)


class FacultyNetworkHTTPHandler(BaseHTTPRequestHandler):
    """Custom request handler for the Faculty Collaboration Network visualizer."""

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        request_path = parsed_url.path
        query_parameters = urllib.parse.parse_qs(parsed_url.query)

        # 1. Serve static/index.html on GET /
        if request_path == "/" or request_path == "/index.html":
            self.serve_static_file(os.path.join("static", "index.html"), "text/html; charset=utf-8")
            return

        # 2. Serve data/graph.json as JSON on GET /api/graph
        if request_path == "/api/graph":
            self.serve_graph_data()
            return

        # 3. Proxy faculty photo images on GET /api/photo?src=<encoded-url>
        if request_path == "/api/photo":
            # Support both 'src' and 'url' parameters for backward compatibility
            source_url_list = query_parameters.get("src") or query_parameters.get("url")
            if not source_url_list:
                self.serve_transparent_png()
                return

            target_photo_url = source_url_list[0]
            self.proxy_photo(target_photo_url)
            return

        # 4. Serve any file under static/ by its path for CSS/JS assets
        if request_path.startswith("/static/"):
            # Sanitize path to prevent directory traversal
            relative_path = request_path.lstrip("/")
            normalized_path = os.path.normpath(relative_path)

            # Ensure the path remains strictly inside the static/ folder
            if not normalized_path.startswith("static" + os.sep) and normalized_path != "static":
                self.send_error_response(403, "Access Denied")
                return

            if not os.path.exists(normalized_path) or os.path.isdir(normalized_path):
                self.send_error_response(404, "File Not Found")
                return

            mime_type, content_encoding = mimetypes.guess_type(normalized_path)
            if not mime_type:
                mime_type = "application/octet-stream"

            self.serve_static_file(normalized_path, mime_type)
            return

        # Default fallback for unmapped endpoints
        self.send_error_response(404, "Not Found")

    def serve_static_file(self, file_path, content_type):
        """Helper to read and serve a local static file."""
        try:
            with open(file_path, "rb") as file_handle:
                file_content = file_handle.read()
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(file_content)))
            self.end_headers()
            self.wfile.write(file_content)
        except Exception as file_read_exception:
            self.send_error_response(500, f"Internal Server Error: {str(file_read_exception)}")

    def serve_graph_data(self):
        """Serves data/graph.json or responds with a 503 if missing."""
        graph_file_path = os.path.join("data", "graph.json")
        if not os.path.exists(graph_file_path):
            error_payload = {"error": "Run pipeline/metrics.py first"}
            error_json_bytes = json.dumps(error_payload).encode("utf-8")
            self.send_response(503)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(error_json_bytes)))
            self.end_headers()
            self.wfile.write(error_json_bytes)
            return

        self.serve_static_file(graph_file_path, "application/json; charset=utf-8")

    def proxy_photo(self, photo_url):
        """Proxies an external photo URL or returns a fallback 1x1 transparent PNG on failure."""
        browser_user_agent = (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        )
        try:
            request_object = urllib.request.Request(
                photo_url,
                headers={"User-Agent": browser_user_agent}
            )
            # Fetch with a reasonable timeout of 8 seconds
            with urllib.request.urlopen(request_object, timeout=8) as response:
                content_type = response.headers.get("Content-Type", "image/jpeg")
                photo_bytes = response.read()

            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(photo_bytes)))
            self.send_header("Cache-Control", "public, max-age=86400")
            self.end_headers()
            self.wfile.write(photo_bytes)
        except Exception as proxy_exception:
            # Fall back to returning a transparent 1x1 PNG on any error
            self.serve_transparent_png()

    def serve_transparent_png(self):
        """Serves a 1x1 transparent PNG."""
        self.send_response(200)
        self.send_header("Content-Type", "image/png")
        self.send_header("Content-Length", str(len(TRANSPARENT_PNG_BYTES)))
        self.end_headers()
        self.wfile.write(TRANSPARENT_PNG_BYTES)

    def send_error_response(self, status_code, message_text):
        """Helper to return a plain-text error response."""
        self.send_response(status_code)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        message_bytes = message_text.encode("utf-8")
        self.send_header("Content-Length", str(len(message_bytes)))
        self.end_headers()
        self.wfile.write(message_bytes)


def main():
    port_string = os.environ.get("PORT", "8000")
    try:
        port_number = int(port_string)
    except ValueError:
        port_number = 8000

    server_address = ("", port_number)
    http_server = HTTPServer(server_address, FacultyNetworkHTTPHandler)
    local_url = f"http://localhost:{port_number}/"
    print(f"Starting Faculty Network Server... Access it at: {local_url}")

    try:
        http_server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.")
        http_server.server_close()
        sys.exit(0)


if __name__ == "__main__":
    main()
