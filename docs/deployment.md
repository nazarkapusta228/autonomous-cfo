# Розгортання

## Передумови

Потрібні доступ до OpenShift команди, registry, PostgreSQL у кластері та модель
в OpenShift AI Model Serving. GPU потрібен моделі, не Streamlit-контейнеру.
У матеріалах немає достатньої інформації для готового маніфесту model serving:
runtime, GPU, storage URI, service account і спосіб авторизації уточнюються в кластері.
Не застосовуйте навмання InferenceService від іншої версії OpenShift AI.

Qwen2.5-7B-Instruct через vLLM — початковий кандидат. Перевірте доступну VRAM,
довжину контексту й підтримку JSON schema обраним runtime.
LLM_BASE_URL має містити `/v1`, LLM_MODEL — фактичне ім'я served model.
Обидва агенти використовують ті самі налаштування. Клієнт не вимикає TLS verification.

## Застосунок

1. Зібрати й завантажити Dockerfile у доступний кластеру registry.
2. Створити PostgreSQL через доступний у кластері operator/template із persistent
   volume та Secret. Локальний compose.yaml не є кластерним розгортанням БД.
3. Застосувати `sql/001_initial.sql` до цільової БД.
4. Створити Secret `cfo-settings` із DATABASE_URL, LLM_BASE_URL, LLM_MODEL, LLM_API_KEY.
   Зберігати секрети поза Git; для DATABASE_URL потрібні окремі кластерні credentials.
5. Замінити `IMAGE_REPLACE_BEFORE_DEPLOY` у маніфесті на опублікований image digest.
6. `oc apply -f deploy/openshift/app.yaml` у namespace команди.
7. Перевірити rollout, Route, health endpoint і реальний запит до моделі.

Deployment підтримує non-root UID OpenShift, Service відкриває 8501,
Route завершує TLS і перенаправляє HTTP на HTTPS. Readiness перевіряє процес
Streamlit; це не перевірка доступності моделі або БД.

Це шаблон першого етапу. Поки UI не викликає агентів, саме розгортання dashboard
ще не демонструє обов'язкове використання LLM. Немає автентифікації, тому публічне
демо допускає лише синтетичний приклад; для робочих даних потрібен контроль доступу.

## Першоджерела

- https://docs.streamlit.io/deploy/tutorials/docker
- https://docs.vllm.ai/en/latest/features/structured_outputs/
- https://huggingface.co/Qwen/Qwen2.5-7B-Instruct
- https://docs.redhat.com/en/documentation/red_hat_openshift_ai_self-managed/3.5
