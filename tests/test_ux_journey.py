"""Regression checks for novice journey and safe recovery from settings."""
from pathlib import Path
import subprocess
import pytest


@pytest.mark.parametrize('case',['draft','results','shortcut','free_review','ai_review','cloud_failure'])
def test_first_time_journey_recovers_context_and_has_short_review(case):
    result=subprocess.run(['node',str(Path(__file__).with_name('ux_journey_regression.cjs')),case],capture_output=True,text=True,timeout=20)
    assert result.returncode==0,result.stdout+result.stderr


def test_welcome_has_a_free_example_before_provider_configuration():
    result=subprocess.run(['node',str(Path(__file__).with_name('ux_onboarding_regression.cjs'))],capture_output=True,text=True,timeout=20)
    assert result.returncode==0,result.stdout+result.stderr


def test_results_offer_a_visible_next_journey():
    result=subprocess.run(['node',str(Path(__file__).with_name('ux_result_navigation.cjs'))],capture_output=True,text=True,timeout=20)
    assert result.returncode==0,result.stdout+result.stderr
