FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY pyproject.toml .
COPY src ./src

RUN pip install --no-cache-dir .

RUN mkdir -p /app/models && \
    curl -fsSL -o /app/models/vi_VN-vais1000-medium.onnx \
      "https://huggingface.co/rhasspy/piper-voices/resolve/main/vi/vi_VN/vais1000/medium/vi_VN-vais1000-medium.onnx" && \
    curl -fsSL -o /app/models/vi_VN-vais1000-medium.onnx.json \
      "https://huggingface.co/rhasspy/piper-voices/resolve/main/vi/vi_VN/vais1000/medium/vi_VN-vais1000-medium.onnx.json"

EXPOSE 8080

CMD ["python", "-m", "uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8080"]
