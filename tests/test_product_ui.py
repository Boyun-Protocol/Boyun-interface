"""Run meaningful shipped UI state/dispatch regressions without a browser service."""
from pathlib import Path
import shutil
import subprocess
import pytest


def test_question_flow_keyboard_and_model_dispatch_contract():
    binary=shutil.which('node')
    if not binary:pytest.skip('Node is required for the shipped UI regression')
    script=Path(__file__).with_name('product_flow_regression.cjs')
    result=subprocess.run([binary,str(script)],capture_output=True,text=True,timeout=20)
    assert result.returncode==0,result.stdout+result.stderr


def test_shared_ambient_light_moves_color_and_responds_to_cursor():
    binary=shutil.which('node')
    if not binary:pytest.skip('Node is required for the ambient light regression')
    script=Path(__file__).with_name('ambient_regression.cjs')
    result=subprocess.run([binary,str(script)],capture_output=True,text=True,timeout=20)
    assert result.returncode==0,result.stdout+result.stderr


def test_recorded_presentation_slides_and_explicit_near_action():
    binary=shutil.which('node')
    if not binary:pytest.skip('Node is required for presentation UI regression')
    result=subprocess.run([binary,str(Path(__file__).with_name('presentation_ui_regression.cjs'))],capture_output=True,text=True,timeout=20)
    assert result.returncode==0,result.stdout+result.stderr


def test_wallet_review_boundaries_before_actual_signing():
    binary=shutil.which('node')
    if not binary:pytest.skip('Node required')
    result=subprocess.run([binary,str(Path(__file__).with_name('wallet_ui_regression.cjs'))],capture_output=True,text=True,timeout=20)
    assert result.returncode==0,result.stdout+result.stderr


def test_onboarding_key_lifecycle_and_host_trust():
    binary=shutil.which('node')
    if not binary:pytest.skip('Node required')
    result=subprocess.run([binary,str(Path(__file__).with_name('onboarding_ui_regression.cjs'))],capture_output=True,text=True,timeout=20)
    assert result.returncode==0,result.stdout+result.stderr
