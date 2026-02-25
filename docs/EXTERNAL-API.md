# External API Documentation

This document provides details about the external APIs available in the system. You can request any API you need to complete your tasks. Below are the endpoints, along with example requests and responses.

---

## API Overview

- **Base URL:** `https://staging.openapi.rogo.com.vn/api/v2.0`
- **Authentication:** All endpoints require an API key in the header (`x-header-apikey`) and a valid access token for protected routes. (this is the project API key )

## Authentication

### Login
**Endpoint:**
```
POST /iot-core/authen/login
```

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Example Curl Command:**
```bash
curl -X 'POST' \
  'https://staging.openapi.rogo.com.vn/api/v2.0/iot-core/authen/login' \
  -H 'accept: application/json' \
  -H 'x-header-apikey: d7953e98-c479-4f08-bc3b-80d4c9b3c03d' \
  -H 'Content-Type: application/json' \
  -d '{
  "email": "tungrogo24@gmail.com",
  "password": "123456"
}'
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsImtpZCI6IjJjMjdhZmY1YzlkNGU1MzVkNWRjMmMwNWM1YTE2N2FlMmY1NjgxYzIiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL3NlY3VyZXRva2VuLmdvb2dsZS5jb20vcm9nby1zdGFnaW5nLTg3YjhkIiwiYXVkIjoicm9nby1zdGFnaW5nLTg3YjhkIiwiYXV0aF90aW1lIjoxNzcxOTkxMDU1LCJ1c2VyX2lkIjoiM292OFVwZVBoa1BLWk9yRUJJT2VibzFxZFJ1MiIsInN1YiI6IjNvdjhVcGVQaGtQS1pPckVCSU9lYm8xcWRSdTIiLCJpYXQiOjE3NzE5OTEwNTUsImV4cCI6MTc3MTk5NDY1NSwiZW1haWwiOiI5dmNrbHU2djJ1dWJjOWp0NnQ2MW9vcDg5ZnkyZHc1aW54OHFvaHBrcHNtPUA2NDc3MDE3OTNiY2RjMzllMzgxMTU3YWIucm9nby52biIsImVtYWlsX3ZlcmlmaWVkIjpmYWxzZSwiZmlyZWJhc2UiOnsiaWRlbnRpdGllcyI6eyJlbWFpbCI6WyI5dmNrbHU2djJ1dWJjOWp0NnQ2MW9vcDg5ZnkyZHc1aW54OHFvaHBrcHNtPUA2NDc3MDE3OTNiY2RjMzllMzgxMTU3YWIucm9nby52biJdfSwic2lnbl9pbl9wcm92aWRlciI6InBhc3N3b3JkIn19.G2d6DvmjmNNdqe7wr5SA94idEHs2nXrQGLuTDxfLKfVDyqCrAWdX34bwp9oAOP5ad2_LkrUoCIgKQaSZFwkriM22dvGGhIfeCgFVozqUUqY2-kN0PbudviUo1tUZ-EMNVYedXieNm8eUpHyfpXwhjPGmJE0u8jmmBcI72Ig9oO9up3Jck1IUL-kicuwd0oOFaAVykiAgSXtFL3EoxXGi3iCg-NdANB-rRiMyEXFrX1dKpD12sOn9C9ZjHZXpdzYLlkyqFIPnZ8PiXsuqltKPTM1FPr65m3e2BsMyfYQN8nEhj-OH_Fbyif5QCnychdfQjaJwHyyjl9RxfAlvdzICsw",
  "token_type": "Bearer",
  "refresh_token": "AMf-vBwHRbPqnFW_KTfmX3Mot3gJGEkkrq19fy9a2-wGslSOJjUfE5dn43GbxZZfb7r7wTHc1fodB77VZxx94sJbE6pEHAbM79AYj_v_BzjAnnfczMrAj7ptA0DDXZENXZwFi_L0XH73aOmozUAFsKSTGotijDOHMmgcMLky6sKTrhcCqzABn7l_rHHqXsyfklxgFPuZFwecXKUYrs1MhnHvF0KLZe_EcPoJ0635JfNQVPLwmSM1tgeGdV7hllzRNjzIdbTAZBEFOStlwgrie6mCgV-Cei045sAmJbrly2cT1sOB40fMuUQ",
  "expires_in": 3600,
  "id_token": ""
}
```

---

### Request Authorization Code
**Endpoint:**
```
POST /iot-core/authen/auth_code/{userId}
```

**Request Params:**
```json
{
  "userId": "user123",
}
```

**Example Curl Command:**
```bash
curl -X 'POST' \
  'https://staging.openapi.rogo.com.vn/api/v2.0/iot-core/authen/auth_code/3ov8UpePhkPKZOrEBIOebo1qdRu2' \
  -H 'accept: */*' \
  -H 'x-header-apikey: d7953e98-c479-4f08-bc3b-80d4c9b3c03d' \
  -d ''
```

**Response:**
```json
{
  "code": "699e70eac34ad5eea01a4cc5"
}
```

---

### Exchange Authorization Code
**Endpoint:**
```
POST /iot-core/authen/token/accesstoken
```

**Request:**
```json
{
  "grant_type": "authorization_code",
  "code": "string"
}
```

**Example Curl Command:**
```bash
curl -X 'POST' \
  'https://staging.openapi.rogo.com.vn/api/v2.0/iot-core/authen/token/accesstoken' \
  -H 'accept: */*' \
  -H 'x-header-apikey: d7953e98-c479-4f08-bc3b-80d4c9b3c03d' \
  -H 'Content-Type: application/json' \
  -d '{
  "grant_type": "authorization_code",
  "code": "699e70eac34ad5eea01a4cc5"
  }'
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsImtpZCI6IjJjMjdhZmY1YzlkNGU1MzVkNWRjMmMwNWM1YTE2N2FlMmY1NjgxYzIiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL3NlY3VyZXRva2VuLmdvb2dsZS5jb20vcm9nby1zdGFnaW5nLTg3YjhkIiwiYXVkIjoicm9nby1zdGFnaW5nLTg3YjhkIiwiYXV0aF90aW1lIjoxNzcxOTkxMzY3LCJ1c2VyX2lkIjoiM292OFVwZVBoa1BLWk9yRUJJT2VibzFxZFJ1MiIsInN1YiI6IjNvdjhVcGVQaGtQS1pPckVCSU9lYm8xcWRSdTIiLCJpYXQiOjE3NzE5OTEzNjcsImV4cCI6MTc3MTk5NDk2NywiZW1haWwiOiI5dmNrbHU2djJ1dWJjOWp0NnQ2MW9vcDg5ZnkyZHc1aW54OHFvaHBrcHNtPUA2NDc3MDE3OTNiY2RjMzllMzgxMTU3YWIucm9nby52biIsImVtYWlsX3ZlcmlmaWVkIjpmYWxzZSwiZmlyZWJhc2UiOnsiaWRlbnRpdGllcyI6eyJlbWFpbCI6WyI5dmNrbHU2djJ1dWJjOWp0NnQ2MW9vcDg5ZnkyZHc1aW54OHFvaHBrcHNtPUA2NDc3MDE3OTNiY2RjMzllMzgxMTU3YWIucm9nby52biJdfSwic2lnbl9pbl9wcm92aWRlciI6ImN1c3RvbSJ9fQ.IbmxZyLG4_rz7LFqbF6o_vE19b1hS2xxIw1PEmDgWIvN419jnHkYabZJsPwxzqjERxtSTqWrtX5jpd9PWctt1RCMxEzGT7GA2X45DNxKVqk4wjNVtJRetGV6pVPT3wIgE5uCJ-a_AggP8IjxnFHncGBriLM6GAbTX5B82hQKRf1btOwmSi1w0V0rbC6ptFM00fhyzRkUK9lE040BSkIiw9qEMQ_f6Q2Qgo_PmxSVupY3P8E1w3_ffzvod-QBUcO0U3E6Y8q83HX9ZwXdAfWtP6Fs-Y20ZESnT8pwt36FACZxGBawFfG1D9WmaK2P2cN9M4OFx8zYPMyxO5WxV5G2pQ",
  "token_type": "Bearer",
  "refresh_token": "AMf-vBxJOq-7_-HsW3qNNlmvk4NgSkcwSS7bJDqSclsafO58jx3MgxgnejuVMh8sRxEWX1G8wUN3pQD3AtPlUuuuSjOAvb7k9gtvtDZ08HVfsVmyIl_vdiEX9oqcF-FYUai5E3gdHP6gDbqauOTRGQdPT1jrnl51KREyYAZTPFZtKJSpY-H1GF2Pz4Y5xwCm0PuAMEdTecs4",
  "expires_in": 3600,
  "id_token": ""
}
```

---

### Refresh Token
**Endpoint:**
```
POST /iot-core/authen/token/accesstoken
```

**Request:**
```json
{
  "grant_type": "refresh_token",
  "refresh_token": "AMf-vBxJOq-7_-HsW3qNNlmvk4NgSkcwSS7bJDqSclsafO58jx3MgxgnejuVMh8sRxEWX1G8wUN3pQD3AtPlUuuuSjOAvb7k9gtvtDZ08HVfsVmyIl_vdiEX9oqcF-FYUai5E3gdHP6gDbqauOTRGQdPT1jrnl51KREyYAZTPFZtKJSpY-H1GF2Pz4Y5xwCm0PuAMEdTecs4"
}
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsImtpZCI6IjJjMjdhZmY1YzlkNGU1MzVkNWRjMmMwNWM1YTE2N2FlMmY1NjgxYzIiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL3NlY3VyZXRva2VuLmdvb2dsZS5jb20vcm9nby1zdGFnaW5nLTg3YjhkIiwiYXVkIjoicm9nby1zdGFnaW5nLTg3YjhkIiwiYXV0aF90aW1lIjoxNzcxOTkxMzY3LCJ1c2VyX2lkIjoiM292OFVwZVBoa1BLWk9yRUJJT2VibzFxZFJ1MiIsInN1YiI6IjNvdjhVcGVQaGtQS1pPckVCSU9lYm8xcWRSdTIiLCJpYXQiOjE3NzE5OTE0NjMsImV4cCI6MTc3MTk5NTA2MywiZW1haWwiOiI5dmNrbHU2djJ1dWJjOWp0NnQ2MW9vcDg5ZnkyZHc1aW54OHFvaHBrcHNtPUA2NDc3MDE3OTNiY2RjMzllMzgxMTU3YWIucm9nby52biIsImVtYWlsX3ZlcmlmaWVkIjpmYWxzZSwiZmlyZWJhc2UiOnsiaWRlbnRpdGllcyI6eyJlbWFpbCI6WyI5dmNrbHU2djJ1dWJjOWp0NnQ2MW9vcDg5ZnkyZHc1aW54OHFvaHBrcHNtPUA2NDc3MDE3OTNiY2RjMzllMzgxMTU3YWIucm9nby52biJdfSwic2lnbl9pbl9wcm92aWRlciI6ImN1c3RvbSJ9fQ.idPiS0MnVgJ3vTCHU54OSa6u4yljkVdeGcRbr3pxXGcFmjPu1qX_-NetWVCC5LJnlRPbyaOd0H7aDuw4iefxtRHLHDOxl7p8i0ml19U6VRGD2ykYY2G5Zks7jCPNCj13WMXdLz7dGQnAdNGhscX2UFhMY1e8NMKWETcGv2Ftp_hfgQuJmdhuqjtzR0szH8E9TacpdFb-ATccZ2-jKnBw4cfsvEvqPaEEMvKfqd6fG--FOirqv6BmgQ4KTrw0LZkgMBvfvHWUi65FZ7P4k2ouk5Qgf9XxF1EHEhKul-7GVn5tacq9ruCnd-J7zPt5j9tQy4SCdfL6yNRDJUS9eDpt8g",
  "token_type": "Bearer",
  "refresh_token": "AMf-vBxJOq-7_-HsW3qNNlmvk4NgSkcwSS7bJDqSclsafO58jx3MgxgnejuVMh8sRxEWX1G8wUN3pQD3AtPlUuuuSjOAvb7k9gtvtDZ08HVfsVmyIl_vdiEX9oqcF-FYUai5E3gdHP6gDbqauOTRGQdPT1jrnl51KREyYAZTPFZtKJSpY-H1GF2Pz4Y5xwCm0PuAMEdTecs4",
  "expires_in": "3600"
}
```

---

## User Information

### Get User Details
**Endpoint:**
```
GET /iot-core/user/{userId}
```

**Example Curl Command:**
```bash
curl -X 'GET' \
  'https://staging.openapi.rogo.com.vn/api/v2.0/iot-core/user/3ov8UpePhkPKZOrEBIOebo1qdRu2' \
  -H 'accept: application/json' \
  -H 'x-header-apikey: d7953e98-c479-4f08-bc3b-80d4c9b3c03d'
```

**Response:**
```json
{
  "userId": "3ov8UpePhkPKZOrEBIOebo1qdRu2",
  "code": "c7e7dcde-e65c-41a1-880d-3c24d75bb319",
  "userMode": 0,
  "endpoint": "rogo-64770179.mqvnaa01",
  "utc": 7,
  "extraInfo": {},
  "createdAt": "2024-11-05T10:40:48.909Z",
  "updatedAt": "2024-11-05T10:40:48.909Z",
  "uuid": "6729f63001ba4ac0704671ec"
}
```