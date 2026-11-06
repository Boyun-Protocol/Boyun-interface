"""The public introduction is inert until the visitor chooses to start."""
from pathlib import Path
import subprocess


def test_landing_precedes_bootstrap_and_the_questionnaire():
    result = subprocess.run(
        ['node', str(Path(__file__).with_name('landing.regression-1.cjs'))],
        capture_output=True, text=True, timeout=20,
    )
    assert result.returncode == 0, result.stdout + result.stderr
