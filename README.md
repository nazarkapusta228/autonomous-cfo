# autonomous-cfo
AI-powered financial assistant for small businesses, built for Collabothon 2026 on Red Hat OpenShift AI.

## Стан реалізації

Dashboard показує історію. Прогноз, агенти Qwen, погодження та симуляція доступні через
Python API і CLI. [Запуск та контракт для інтеграції](docs/agent-backend.md).

Стек: Python 3.12, Streamlit, Plotly, PostgreSQL 16, Psycopg 3, pandas,
Decimal, Pydantic 2, HTTPX. Два звичайні Python-модулі звертаються до одного
OpenAI-compatible endpoint моделі в OpenShift AI. Qwen2.5-7B-Instruct працює через
vLLM на NVIDIA L4 у командному кластері. [Як запустити](docs/deployment.md).

## Локальний запуск

```bash
python3.12 -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
cp .env.example .env
streamlit run app.py
```

У PyCharm відкрийте цей репозиторій і виберіть `.venv/bin/python` як interpreter.
Run configuration: module `streamlit`, arguments `run app.py`, working directory —
корінь репозиторію. Історичний dashboard працює без БД та моделі.

```bash
docker compose up -d db
pytest -q
ruff check .
docker build -t autonomous-cfo:dev .
docker run --rm -p 8501:8501 autonomous-cfo:dev
```

Compose створює лише локальну БД. SQL виконується автоматично для нового volume;
для вже наявної БД застосовуйте SQL-файли окремо через `psql` із `ON_ERROR_STOP=1`.
Локальний пароль із Compose не призначений для розгортання.

## Файли та межі

- `app.py`: завантаження CSV, історичний баланс і таблиця.
- `src/cfo/ingestion.py`: перевірка CSV, EUR/CHF, Decimal.
- `src/cfo/finance.py`: денні залишки та перевірки запропонованих сум.
- `src/cfo/agents/`: ліквідність та інвестиції; приймають готовий прогноз.
- `src/cfo/llm.py`: HTTP-клієнт і структурована відповідь Pydantic.
- `src/cfo/db.py`: атомарний імпорт із захистом від повтору того самого файлу.
- `sql/`: початкова схема транзакцій, рекомендацій та аудиту.
- `deploy/openshift/`: шаблон Deployment, Service, HTTPS Route.
- `tests/`: перевірки фактичного прикладу й фінансових обмежень.
- `docs/`: рішення щодо архітектури, даних і розгортання.

Залежності мають сумісні діапазони, ще не lock-файл. Перед командним релізом
зафіксуйте перевірені версії на Python 3.12 та digest контейнерів.
