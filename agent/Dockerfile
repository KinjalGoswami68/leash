# Alternative host (not used for the live demo, which runs on Vercel via vercel.json): any Docker host, e.g. a
# Hugging Face Docker Space. All config comes from environment variables.
# 3.12, not the 3.14 used locally: the slim image is well tested and every dependency ships a 3.12 Linux wheel.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1

# Spaces run the container as uid 1000; owning /app avoids permission errors at runtime.
RUN useradd -m -u 1000 user
WORKDIR /app

# Requirements first, so code edits don't reinstall dependencies on every rebuild.
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY --chown=user . .
USER user

EXPOSE 7860
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
