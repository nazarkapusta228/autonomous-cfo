from pathlib import Path

from streamlit.testing.v1 import AppTest


def test_dashboard_loads_sample_and_reconciles():
    app = AppTest.from_file(str(Path(__file__).parents[1] / "app.py")).run(timeout=30)
    assert not app.exception
    assert app.metric[0].value == "1125"
    assert app.metric[1].value == "€30,766.35"
    app.text_input[0].set_value("2500.00").run()
    assert not app.exception
    assert app.metric[1].value == "€33,266.35"


def test_dashboard_rejects_invalid_opening():
    app = AppTest.from_file(str(Path(__file__).parents[1] / "app.py")).run(timeout=30)
    app.text_input[0].set_value("NaN").run()
    assert not app.exception
    assert len(app.error) == 1
    assert len(app.metric) == 0
