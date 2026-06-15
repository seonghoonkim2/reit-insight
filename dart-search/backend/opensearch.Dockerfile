# OpenSearch + 한국어 형태소 분석 플러그인(analysis-nori)
FROM opensearchproject/opensearch:2.13.0
RUN /usr/share/opensearch/bin/opensearch-plugin install --batch analysis-nori
