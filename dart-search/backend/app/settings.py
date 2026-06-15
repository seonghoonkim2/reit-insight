"""환경설정 (docker-compose 에서 환경변수로 주입)."""
import os

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql://gongsi:gongsi@postgres:5432/gongsilens"
)
OPENSEARCH_URL = os.environ.get("OPENSEARCH_URL", "http://opensearch:9200")
OPENSEARCH_INDEX = os.environ.get("OPENSEARCH_INDEX", "chunks")
# 검색 백엔드: "opensearch"(기본) 실패 시 자동으로 Postgres 폴백
SEARCH_BACKEND = os.environ.get("SEARCH_BACKEND", "opensearch")
CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "*")
