"""
firewall/tests_api.py
=====================
Test cases for the DLP API endpoints and detect_sensitive().

Run with:
    python manage.py test firewall.tests_api
"""

import json
import io
from django.test import TestCase, Client


class DetectSensitiveTests(TestCase):
    """Unit tests for the detect_sensitive() function."""

    def setUp(self):
        from firewall.detector import detect_sensitive
        self.detect = detect_sensitive

    def test_email_is_blocked(self):
        self.assertEqual(self.detect("Contact me at john@gmail.com"), "BLOCK")

    def test_phone_is_blocked(self):
        self.assertEqual(self.detect("Call me on 9876543210"), "BLOCK")

    def test_bank_account_is_blocked(self):
        self.assertEqual(self.detect("Account number: 123456789012"), "BLOCK")

    def test_ifsc_triggers_block(self):
        # IFSC matches financial_account / embedded pattern
        self.assertEqual(self.detect("IFSC: SBIN0001234"), "BLOCK")

    def test_credit_card_is_blocked(self):
        self.assertEqual(self.detect("Card: 4111 1111 1111 1111"), "BLOCK")

    def test_api_key_is_blocked(self):
        self.assertEqual(self.detect("My key is sk-abc123456789abcdef"), "BLOCK")

    def test_normal_sentence_is_safe(self):
        self.assertEqual(self.detect("What is the weather like today?"), "SAFE")

    def test_empty_string_is_safe(self):
        self.assertEqual(self.detect(""), "SAFE")

    def test_generic_question_is_safe(self):
        self.assertEqual(self.detect("Explain how neural networks work."), "SAFE")

    def test_password_is_blocked(self):
        self.assertEqual(self.detect("password=SuperSecret123"), "BLOCK")


class AnalyzeEndpointTests(TestCase):
    """Integration tests for POST /analyze."""

    def setUp(self):
        self.client = Client()

    def test_safe_text(self):
        resp = self.client.post(
            "/analyze",
            data=json.dumps({"text": "Hello, how are you?"}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), {"status": "SAFE"})

    def test_email_blocked(self):
        resp = self.client.post(
            "/analyze",
            data=json.dumps({"text": "Reach me at alice@example.com"}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), {"status": "BLOCK"})

    def test_phone_blocked(self):
        resp = self.client.post(
            "/analyze",
            data=json.dumps({"text": "My number is 9123456780"}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), {"status": "BLOCK"})

    def test_missing_text_field(self):
        resp = self.client.post(
            "/analyze",
            data=json.dumps({}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_invalid_json(self):
        resp = self.client.post(
            "/analyze",
            data="not json",
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 400)


class AnalyzeFileEndpointTests(TestCase):
    """Integration tests for POST /analyze-file."""

    def setUp(self):
        self.client = Client()

    def test_txt_safe(self):
        f = io.BytesIO(b"The sky is blue and the grass is green.")
        f.name = "note.txt"
        resp = self.client.post("/analyze-file", {"document": f})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), {"status": "SAFE"})

    def test_txt_blocked_email(self):
        f = io.BytesIO(b"Please contact support@company.com for help.")
        f.name = "email.txt"
        resp = self.client.post("/analyze-file", {"document": f})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), {"status": "BLOCK"})

    def test_txt_blocked_phone(self):
        f = io.BytesIO(b"Call us at 9988776655 anytime.")
        f.name = "contact.txt"
        resp = self.client.post("/analyze-file", {"document": f})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json(), {"status": "BLOCK"})

    def test_no_file_returns_400(self):
        resp = self.client.post("/analyze-file", {})
        self.assertEqual(resp.status_code, 400)

    def test_unsupported_format_returns_422(self):
        f = io.BytesIO(b"<html></html>")
        f.name = "page.html"
        resp = self.client.post("/analyze-file", {"document": f})
        self.assertEqual(resp.status_code, 422)
