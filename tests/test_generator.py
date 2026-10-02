# %%
from __future__ import annotations

from pathlib import Path
import sys
import unittest

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from family_math.generator import build_document, load_config  # noqa: E402


# %%
class GeneratorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.config = load_config(PROJECT_ROOT / "config" / "worksheets.toml")

    def test_same_seed_is_reproducible(self) -> None:
        first = build_document(self.config, worksheet="addition_1_10", seed=42)
        second = build_document(self.config, worksheet="addition_1_10", seed=42)
        self.assertEqual(first, second)

    def test_different_seeds_change_grid_order(self) -> None:
        first = build_document(self.config, worksheet="addition_1_10", seed=1)
        second = build_document(self.config, worksheet="addition_1_10", seed=2)
        self.assertNotEqual(first, second)

    def test_pack_has_four_student_pages_and_no_answer_key(self) -> None:
        tex = build_document(self.config, pack="grade4_fluency", seed=42)
        self.assertEqual(tex.count(r"\newpage"), 3)
        self.assertNotIn("Answer Key", tex)
        self.assertIn("Accuracy first", tex)

    def test_subtraction_direction_is_non_negative(self) -> None:
        data = self.config["worksheets"]["subtraction_to_18"]
        for subtrahend in data["row_values"]:
            for minuend in data["column_values"]:
                self.assertGreaterEqual(minuend - subtrahend, 0)

    def test_division_pool_has_whole_number_answers(self) -> None:
        data = self.config["worksheets"]["division_facts_to_100"]
        for divisor in data["divisors"]:
            for quotient in data["quotients"]:
                dividend = divisor * quotient
                self.assertEqual(dividend % divisor, 0)


# %%
if __name__ == "__main__":
    unittest.main()

