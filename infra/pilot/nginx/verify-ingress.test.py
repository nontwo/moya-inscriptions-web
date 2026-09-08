"""Synthetic callback-only Search ingress regressions; no network or private data."""

import importlib.util
import json
from pathlib import Path
import unittest
import urllib.parse


spec = importlib.util.spec_from_file_location(
    "verify_ingress", Path(__file__).with_name("verify-ingress.py")
)
ingress = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ingress)


class SearchIngressTests(unittest.TestCase):
    def setUp(self):
        self.page = {"items": [{"id": "synthetic-catalog-1", "title": "合成检索 A&B"}]}
        self.headers = {
            "content-type": "application/json",
            "cache-control": "private, no-store",
            "referrer-policy": "no-referrer",
            "x-robots-tag": "noindex, nofollow, noarchive",
        }
        self.item = {"id": "synthetic-catalog-1", "matchKind": "title-exact"}
        self.calls = []
        self.missing_query_status = 400

    def authenticated(self, path, method="GET"):
        self.calls.append((path, method))
        return self.headers, json.dumps({"items": [self.item]}).encode()

    def request(self, path, *, credential):
        self.assertEqual(path, "/api/catalog-search")
        self.assertEqual(credential, "synthetic-auth")
        return self.missing_query_status, self.headers, b""

    def verify(self):
        ingress.verify_catalog_search(
            self.page, self.authenticated, self.request, "synthetic-auth"
        )

    def test_current_title_is_encoded_and_get_head_are_checked(self):
        self.verify()
        self.assertEqual([method for _, method in self.calls], ["GET", "HEAD"])
        self.assertEqual(self.calls[0][0], self.calls[1][0])
        parsed = urllib.parse.urlsplit(self.calls[0][0])
        self.assertEqual(parsed.path, "/api/catalog-search")
        self.assertEqual(urllib.parse.parse_qs(parsed.query), {"q": ["合成检索 A&B"]})

    def test_wrong_identity_is_rejected_with_fixed_code(self):
        self.item["id"] = "synthetic-other-record"
        with self.assertRaisesRegex(ingress.ProbeError, "^SEARCH_EXACT_IDENTITY_MISMATCH$"):
            self.verify()

    def test_lower_match_tier_cannot_pass_as_exact(self):
        self.item["matchKind"] = "body"
        with self.assertRaisesRegex(ingress.ProbeError, "^SEARCH_EXACT_RANK_MISMATCH$"):
            self.verify()

    def test_missing_query_cannot_return_success(self):
        self.missing_query_status = 200
        with self.assertRaisesRegex(ingress.ProbeError, "^SEARCH_MISSING_QUERY_NOT_REJECTED$"):
            self.verify()

    def test_error_response_must_keep_private_headers(self):
        self.headers["cache-control"] = "public"
        with self.assertRaisesRegex(ingress.ProbeError, "^CACHE_POLICY_INVALID$"):
            self.verify()


if __name__ == "__main__":
    unittest.main()
