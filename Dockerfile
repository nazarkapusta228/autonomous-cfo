FROM node:22-alpine AS dashboard
WORKDIR /view
COPY view/package*.json ./
RUN npm ci --no-audit --no-fund
COPY view/index.html view/vite.config.js ./
COPY view/src ./src
COPY view/public ./public
RUN npm run build

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY pyproject.toml ./
COPY src ./src
RUN pip install --no-cache-dir .
COPY data/sample ./data/sample
COPY --from=dashboard /view/dist ./view/dist
USER 1001
EXPOSE 8080
CMD ["python", "-m", "uvicorn", "cfo.web:app", "--host", "0.0.0.0", "--port", "8080"]
