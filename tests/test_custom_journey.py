"""Regressions for the personal-question journey, using shipped UI fixtures."""
from pathlib import Path
import subprocess
import pytest


@pytest.mark.parametrize('case', ['privacy_exit', 'library_return', 'focused_followups'])
def test_custom_journey_keeps_work_and_respects_selected_path(case):
    result = subprocess.run(
        ['node', str(Path(__file__).with_name('custom_journey.regression-1.cjs')), case],
        capture_output=True, text=True, timeout=20,
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_presentation_returns_to_the_retained_question_only_when_available():
    result = subprocess.run(
        ['node', str(Path(__file__).with_name('presentation_return.regression-1.cjs'))],
        capture_output=True, text=True, timeout=20,
    )
    assert result.returncode == 0, result.stdout + result.stderr
