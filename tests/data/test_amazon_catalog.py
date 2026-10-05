import importlib.util
import pathlib
import unittest

script = pathlib.Path(__file__).resolve().parents[2] / "scripts/download-amazon-catalog.py"
spec = importlib.util.spec_from_file_location("amazon_catalog", script)
catalog = importlib.util.module_from_spec(spec)
spec.loader.exec_module(catalog)


class CatalogBoundaries(unittest.TestCase):
    def product(self, **changes):
        return {"parent_asin": "B000000001", "title": "Test product", "price": "12.50",
                "images": [{"large": "https://m.media-amazon.com/images/test.jpg"}], **changes}

    def test_missing_or_invalid_prices_remain_unknown(self):
        for value in (None, "None", -1, True, "nan", "inf"):
            self.assertIsNone(catalog.normalize(self.product(price=value), "Electronics")["price"])
        self.assertEqual(catalog.normalize(self.product(), "Electronics")["price"], 12.5)

    def test_only_public_allowlisted_metadata_and_image_urls_survive(self):
        source = self.product(user_id="private", email="private", details={"Phone": "private"},
                              images=[{"large": "http://localhost/private"},
                                      {"large": "https://attacker.test/image.jpg"},
                                      {"large": "https://m.media-amazon.com/images/test.jpg"}])
        result = catalog.normalize(source, "Electronics")
        self.assertEqual(result["images"], ["https://m.media-amazon.com/images/test.jpg"])
        self.assertFalse(set(result) & {"user_id", "email", "details", "reviews"})

    def test_unusable_records_are_excluded_and_text_is_bounded(self):
        for record in (None, self.product(title=" "), self.product(parent_asin="bad"),
                       self.product(images=None), self.product(images={}),
                       self.product(images=[{"large": "https://[invalid"}])):
            self.assertIsNone(catalog.normalize(record, "Electronics"))
        result = catalog.normalize(self.product(title="x" * 10000, description=["x" * 10000] * 100), "Electronics")
        self.assertEqual(len(result["title"]), 500)
        self.assertLessEqual(len(result["description"]), 8007)


if __name__ == "__main__":
    unittest.main()
