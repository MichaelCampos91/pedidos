#!/bin/bash

# Script de teste para validar integração Melhor Envio no sandbox
# Uso: ./scripts/test-melhor-envio-sandbox.sh [CLIENT_ID] [CLIENT_SECRET]

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configurações
ENVIRONMENT="sandbox"
BASE_URL_SANDBOX="https://sandbox.melhorenvio.com.br"
BASE_URL_PRODUCTION="https://melhorenvio.com.br"
API_BASE_SANDBOX="${BASE_URL_SANDBOX}/api/v2/me"
API_BASE_PRODUCTION="${BASE_URL_PRODUCTION}/api/v2/me"

# Verificar se client_id e client_secret foram fornecidos
if [ -z "$1" ] || [ -z "$2" ]; then
    echo -e "${RED}Erro: Client ID e Client Secret são obrigatórios${NC}"
    echo "Uso: $0 <CLIENT_ID> <CLIENT_SECRET>"
    echo ""
    echo "Exemplo:"
    echo "  $0 abc123 xyz789"
    exit 1
fi

CLIENT_ID="$1"
CLIENT_SECRET="$2"

echo -e "${GREEN}=== Teste de Integração Melhor Envio - Sandbox ===${NC}"
echo ""

# Função para fazer requisição OAuth2
get_oauth_token() {
    local env=$1
    local base_url=""
    
    if [ "$env" = "sandbox" ]; then
        base_url="$BASE_URL_SANDBOX"
    else
        base_url="$BASE_URL_PRODUCTION"
    fi
    
    local token_endpoint="${base_url}/oauth/token"
    
    echo -e "${YELLOW}[1/${2}] Obtendo token OAuth2 via client_credentials (${env})...${NC}"
    
    local response=$(curl -s -w "\n%{http_code}" -X POST "${token_endpoint}" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -H "Accept: application/json" \
        -u "${CLIENT_ID}:${CLIENT_SECRET}" \
        -d "grant_type=client_credentials" \
        -d "client_id=${CLIENT_ID}" \
        -d "client_secret=${CLIENT_SECRET}")
    
    local http_code=$(echo "$response" | tail -n1)
    local body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" != "200" ]; then
        echo -e "${RED}✗ Falha ao obter token OAuth2${NC}"
        echo "HTTP Status: $http_code"
        echo "Resposta: $body"
        return 1
    fi
    
    local access_token=$(echo "$body" | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)
    local refresh_token=$(echo "$body" | grep -o '"refresh_token":"[^"]*' | cut -d'"' -f4 || echo "")
    local expires_in=$(echo "$body" | grep -o '"expires_in":[0-9]*' | cut -d':' -f2)
    
    if [ -z "$access_token" ]; then
        echo -e "${RED}✗ Token não encontrado na resposta${NC}"
        echo "Resposta: $body"
        return 1
    fi
    
    echo -e "${GREEN}✓ Token obtido com sucesso${NC}"
    echo "  Access Token: ${access_token:0:20}...${access_token: -4}"
    echo "  Expires In: ${expires_in}s"
    if [ -n "$refresh_token" ]; then
        echo "  Refresh Token: ${refresh_token:0:20}...${refresh_token: -4}"
    else
        echo "  Refresh Token: (não fornecido)"
    fi
    
    # Retornar token via variável global (bash não retorna strings facilmente)
    export ACCESS_TOKEN="$access_token"
    export REFRESH_TOKEN="$refresh_token"
    export EXPIRES_IN="$expires_in"
    
    return 0
}

# Função para testar GET /shipment/services
test_get_services() {
    local env=$1
    local api_base=""
    
    if [ "$env" = "sandbox" ]; then
        api_base="$API_BASE_SANDBOX"
    else
        api_base="$API_BASE_PRODUCTION"
    fi
    
    echo -e "${YELLOW}[2/${2}] Testando GET /shipment/services (${env})...${NC}"
    
    local response=$(curl -s -w "\n%{http_code}" -X GET "${api_base}/shipment/services" \
        -H "Authorization: Bearer ${ACCESS_TOKEN}" \
        -H "Accept: application/json")
    
    local http_code=$(echo "$response" | tail -n1)
    local body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" != "200" ]; then
        echo -e "${RED}✗ Falha ao listar serviços${NC}"
        echo "HTTP Status: $http_code"
        echo "Resposta: $body"
        return 1
    fi
    
    local services_count=$(echo "$body" | grep -o '"id"' | wc -l || echo "0")
    echo -e "${GREEN}✓ Serviços listados com sucesso${NC}"
    echo "  Serviços encontrados: $services_count"
    
    return 0
}

# Função para testar POST /shipment/calculate
test_calculate() {
    local env=$1
    local api_base=""
    
    if [ "$env" = "sandbox" ]; then
        api_base="$API_BASE_SANDBOX"
    else
        api_base="$API_BASE_PRODUCTION"
    fi
    
    echo -e "${YELLOW}[3/${2}] Testando POST /shipment/calculate (${env})...${NC}"
    
    local payload='{
        "from": {"postal_code": "01310100"},
        "to": {"postal_code": "01310100"},
        "products": [{
            "id": "1",
            "width": 10,
            "height": 10,
            "length": 10,
            "weight": 0.3,
            "insurance_value": 100,
            "quantity": 1
        }]
    }'
    
    local response=$(curl -s -w "\n%{http_code}" -X POST "${api_base}/shipment/calculate" \
        -H "Authorization: Bearer ${ACCESS_TOKEN}" \
        -H "Content-Type: application/json" \
        -H "Accept: application/json" \
        -d "$payload")
    
    local http_code=$(echo "$response" | tail -n1)
    local body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" != "200" ]; then
        echo -e "${RED}✗ Falha ao calcular frete${NC}"
        echo "HTTP Status: $http_code"
        echo "Resposta: $body"
        
        if [ "$http_code" = "401" ]; then
            echo ""
            echo -e "${YELLOW}Diagnóstico 401:${NC}"
            echo "  - Token pode estar inválido/expirado"
            echo "  - Token pode ser de ambiente diferente (sandbox vs production)"
            echo "  - Token pode não ter escopo/permissão para calcular fretes"
            echo "  - Use o fluxo authorization_code com scopes para obter todas as permissões"
        fi
        
        return 1
    fi
    
    local options_count=$(echo "$body" | grep -o '"id"' | wc -l || echo "0")
    echo -e "${GREEN}✓ Cálculo de frete realizado com sucesso${NC}"
    echo "  Opções de frete encontradas: $options_count"
    
    return 0
}

# Função para testar refresh token
test_refresh_token() {
    local env=$1
    
    if [ -z "$REFRESH_TOKEN" ]; then
        echo -e "${YELLOW}[4/${2}] Refresh token não disponível (pulando teste)${NC}"
        return 0
    fi
    
    local base_url=""
    if [ "$env" = "sandbox" ]; then
        base_url="$BASE_URL_SANDBOX"
    else
        base_url="$BASE_URL_PRODUCTION"
    fi
    
    local token_endpoint="${base_url}/oauth/token"
    
    echo -e "${YELLOW}[4/${2}] Testando refresh token (${env})...${NC}"
    
    local response=$(curl -s -w "\n%{http_code}" -X POST "${token_endpoint}" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -H "Accept: application/json" \
        -d "grant_type=refresh_token" \
        -d "refresh_token=${REFRESH_TOKEN}")
    
    local http_code=$(echo "$response" | tail -n1)
    local body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" != "200" ]; then
        echo -e "${RED}✗ Falha ao renovar token${NC}"
        echo "HTTP Status: $http_code"
        echo "Resposta: $body"
        return 1
    fi
    
    local new_access_token=$(echo "$body" | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)
    
    if [ -z "$new_access_token" ]; then
        echo -e "${RED}✗ Novo token não encontrado na resposta${NC}"
        return 1
    fi
    
    echo -e "${GREEN}✓ Token renovado com sucesso${NC}"
    echo "  Novo Access Token: ${new_access_token:0:20}...${new_access_token: -4}"
    
    # Atualizar token para próximos testes
    export ACCESS_TOKEN="$new_access_token"
    
    return 0
}

# Função para validar que token de sandbox não funciona em produção
test_environment_isolation() {
    echo -e "${YELLOW}[5/6] Validando isolamento de ambiente (token sandbox não deve funcionar em produção)...${NC}"
    
    # Tentar usar token de sandbox em produção
    local response=$(curl -s -w "\n%{http_code}" -X GET "${API_BASE_PRODUCTION}/shipment/services" \
        -H "Authorization: Bearer ${ACCESS_TOKEN}" \
        -H "Accept: application/json")
    
    local http_code=$(echo "$response" | tail -n1)
    
    if [ "$http_code" = "401" ]; then
        echo -e "${GREEN}✓ Isolamento de ambiente confirmado${NC}"
        echo "  Token de sandbox corretamente rejeitado em produção"
        return 0
    elif [ "$http_code" = "200" ]; then
        echo -e "${RED}✗ Falha no isolamento de ambiente${NC}"
        echo "  Token de sandbox funcionou em produção (não deveria)"
        return 1
    else
        echo -e "${YELLOW}⚠ Status inesperado: $http_code${NC}"
        return 0
    fi
}

# Executar testes
TOTAL_STEPS=6
PASSED=0
FAILED=0

echo "Ambiente: $ENVIRONMENT"
echo "Client ID: ${CLIENT_ID:0:10}..."
echo ""

# Teste 1: Obter token OAuth2
if get_oauth_token "$ENVIRONMENT" "$TOTAL_STEPS"; then
    ((PASSED++))
else
    ((FAILED++))
    echo -e "${RED}Testes interrompidos devido a falha na obtenção do token${NC}"
    exit 1
fi

echo ""

# Teste 2: GET /shipment/services
if test_get_services "$ENVIRONMENT" "$TOTAL_STEPS"; then
    ((PASSED++))
else
    ((FAILED++))
fi

echo ""

# Teste 3: POST /shipment/calculate
if test_calculate "$ENVIRONMENT" "$TOTAL_STEPS"; then
    ((PASSED++))
else
    ((FAILED++))
fi

echo ""

# Teste 4: Refresh token
if test_refresh_token "$ENVIRONMENT" "$TOTAL_STEPS"; then
    ((PASSED++))
else
    ((FAILED++))
fi

echo ""

# Teste 5: Isolamento de ambiente
if test_environment_isolation; then
    ((PASSED++))
else
    ((FAILED++))
fi

echo ""
echo -e "${GREEN}=== Resumo dos Testes ===${NC}"
echo "Passou: $PASSED/$TOTAL_STEPS"
echo "Falhou: $FAILED/$TOTAL_STEPS"

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ Todos os testes passaram!${NC}"
    exit 0
else
    echo -e "${RED}✗ Alguns testes falharam${NC}"
    exit 1
fi
