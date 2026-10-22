#!/usr/bin/env python3
"""Scripted stand-in for the Gemini API, used by demo/gemini-mock-demo.sh to run the REAL
Gemini CLI through `kb compound --agent gemini` without network access or an API key.

What is mocked: only the model.
  generateContent (the CLI's model router / utility calls) -> a fixed routing answer;
  streamGenerateContent turn 1 -> one write_file call per page of the task's write set (parsed
      from kb's prompt) plus pages/evil-gemini.md, outside the write set, for kb's guard to revert;
  turn 2 (after the functionResponses) -> "done".
Everything else is real: the gemini binary, auth/config handling, auto_edit approval mode, its
write_file tool, -o json output; kb's prompt, guard, post-processing and verify.

usage: mock_gemini.py <port> <request-log.jsonl>
"""
import json
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT, LOG = int(sys.argv[1]), sys.argv[2]
WRITE_SET = re.compile(r"^- `(pages/[^`]+\.md)`$", re.M)
USAGE = {"promptTokenCount": 900, "candidatesTokenCount": 30, "totalTokenCount": 930, "thoughtsTokenCount": 4}


def write_set(text):
    i = text.find("## 可写集合")
    if i >= 0:
        text = text[i:]
        j = text.find("## 规则")
        if j >= 0:
            text = text[:j]
    return WRITE_SET.findall(text)


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("content-length") or 0))
        try:
            req = json.loads(body or b"{}")
        except ValueError:
            req = {}
        text, answered = "", False
        for c in req.get("contents", []):
            for p in c.get("parts", []):
                if isinstance(p.get("text"), str):
                    text += p["text"] + "\n"
                if "functionResponse" in p:
                    answered = True
        tools = [f.get("name") for t in req.get("tools", []) for f in t.get("functionDeclarations", [])]
        with open(LOG, "a", encoding="utf-8") as f:
            f.write(json.dumps({"path": self.path, "tools": tools, "answered": answered}) + "\n")
        if "streamGenerateContent" not in self.path:
            out = {"candidates": [{"content": {"role": "model", "parts": [{"text": '{"reasoning":"simple","model_choice":"flash"}'}]}, "finishReason": "STOP"}], "usageMetadata": USAGE}
            data = json.dumps(out).encode()
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        if answered:
            parts = [{"text": "done"}]
        else:
            parts = []
            for p in write_set(text):
                pid = p[len("pages/"):-len(".md")]
                content = f"---\nid: {pid}\ntitle: features/{pid.split('/')[-1]}（gemini mock）\nsources: []\n---\n# gemini mock page\n\n[总览](../overview.md)\n"
                parts.append({"functionCall": {"name": "write_file", "args": {"file_path": p, "content": content}}})
            parts.append({"functionCall": {"name": "write_file", "args": {"file_path": "pages/evil-gemini.md", "content": "outside\n"}}})
        ev = {"candidates": [{"content": {"role": "model", "parts": parts}, "finishReason": "STOP"}], "usageMetadata": USAGE}
        data = f"data: {json.dumps(ev)}\n\n".encode()
        self.send_response(200)
        self.send_header("content-type", "text/event-stream")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
