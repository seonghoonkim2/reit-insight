# 백엔드(FastAPI) 이미지. build context 는 dart-search/ (compose 에서 지정)
FROM python:3.12-slim

WORKDIR /app
COPY backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# 앱 코드 + 데모 데이터(데이터 미마운트 시 fallback)
COPY backend/app /app/app
COPY backend/load.py /app/load.py
COPY backend/opensearch /app/opensearch
COPY web/demo-data.js /app/demo-data.js
COPY web/reits-demo.js /app/reits-demo.js
COPY web/bonds-demo.js /app/bonds-demo.js

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
