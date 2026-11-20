# Запуск Autonomous CFO в OpenShift AI

Застосунок працює в проєкті `autonomous-cfo`. OpenShift Route веде на FastAPI, який віддає
React і обробляє запити обох агентів. PostgreSQL 16 використовує PVC. Модель
Qwen2.5-7B-Instruct працює в KServe через vLLM на одному NVIDIA L4. Лише вебзастосунок
потребує зовнішнього Route.

## Відкрити наявне демо

[Відкрити Autonomous CFO](https://autonomous-cfo-autonomous-cfo.apps.ocp.dtnkb.sandbox1202.opentlc.com/)

У вебконсолі OpenShift оберіть проєкт **autonomous-cfo → Networking → Routes → autonomous-cfo**
і відкрийте **Location**. Адресу також можна отримати через CLI після входу командою,
яку видає вебконсоль через **Copy login command**.

```sh
oc project autonomous-cfo
oc get route autonomous-cfo -o jsonpath='https://{.spec.host}{"\n"}'
oc get isvc cfo-qwen
oc get deployments,pvc
```

Для перевірки відкрийте Dashboard, запустіть liquidity agent і погодьте симуляцію.
Після оновлення сторінки стан і номер заявки відновлюються з PostgreSQL. Щоб показати
інвестиційний сценарій, у Liquidity Agent задайте початковий залишок 25000, натисніть
Run forecast і потім Run investment agent у вкладці Investment.

## Зібрати й розгорнути поточний коміт

З кореня Git-репозиторію після входу в OpenShift виконайте:

```sh
oc project autonomous-cfo
sh scripts/deploy_web.sh
```

Скрипт застосує SQL, створить BuildConfig, передасть архів відстежуваних файлів із HEAD,
дочекається збірки та розгорне її образ за digest. Потім перевірить rollout і виведе URL.
Локальні .env, node_modules і реквізити кластера до архіву не входять.
У випадку помилки перегляньте `oc logs -f bc/autonomous-cfo`,
`oc logs deployment/autonomous-cfo` або `oc describe isvc cfo-qwen`.

## Відтворити інфраструктуру в новому проєкті

Потрібні налаштовані OpenShift AI, KServe, доступний NVIDIA GPU, внутрішній registry
та доступ до образів моделі й runtime. Для ідентичної конфігурації використайте:

```sh
oc apply -f deploy/openshift/project.yaml
oc project autonomous-cfo
oc apply -f deploy/openshift/qwen.yaml
python scripts/create_settings.py --namespace autonomous-cfo
oc apply -f deploy/openshift/postgres.yaml
oc rollout status deployment/cfo-postgres
sh scripts/deploy_web.sh
```

Скрипт налаштувань використовує kubectl з поточним kubeconfig. Створюйте Secret один
раз для нового PVC. Адреса моделі всередині цього проєкту —
`http://cfo-qwen-predictor:8080/v1`. Обидва агенти використовують served model
`Qwen/Qwen2.5-7B-Instruct`. Стан GPU-сервісу доступний також у панелі OpenShift AI.

## Спільний GPU

Для запуску Qwen демосервіс `my-first-model/llama-32-3b-instruct` призупинено через
анотацію KServe. Обидві моделі зберігають свої конфігурації. Якщо команда пізніше
вирішить повернути GPU демомоделі:

```sh
oc -n autonomous-cfo annotate isvc cfo-qwen serving.kserve.io/stop=true --overwrite
oc -n my-first-model annotate isvc llama-32-3b-instruct serving.kserve.io/stop=false --overwrite
```

Кластер одночасно обслуговує одну з цих моделей. [Картка Qwen](https://huggingface.co/Qwen/Qwen2.5-7B-Instruct),
[Red Hat OpenShift AI Model Serving](https://docs.redhat.com/en/documentation/red_hat_openshift_ai_self-managed/3.5/html/deploying_models/index).
