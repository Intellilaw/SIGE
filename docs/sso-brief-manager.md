# SSO contract: SIGE -> Manager de Escritos

This document is the contract that the Laravel team needs to follow to accept
SIGE-issued SSO tickets for the "Manager de Escritos" application.

SIGE is the identity origin (APP-ORIGEN). Manager de Escritos is the destination
(APP-DESTINO). The handshake is a one-shot JWT delivered via the user's browser
in a 302 redirect.

## Flow

1. User opens SIGE, logs in normally, lands on the dashboard.
2. User clicks the "Manager de escritos" tile.
3. SIGE web triggers a top-level navigation to `GET /api/v1/sso/brief-manager`.
4. SIGE API verifies the SIGE auth cookie. If valid, it signs a short-lived JWT
   and responds with `302` to:
   `http://3.89.60.26/auth/sso?token=<JWT>` (valor configurable con `BRIEF_MANAGER_SSO_URL` en SIGE).
5. Laravel receives the request at `/auth/sso`, validates the JWT, upserts the
   user into its own `users` table, registers the `jti` to prevent replay, and
   creates its own session (cookie). Then redirects to the home page.

If the SIGE cookie is missing or invalid, SIGE redirects the user to
`/intranet-login` and Laravel is never reached.

## JWT details

- Algorithm: `HS256`.
- Shared secret: env var `SSO_SECRET_KEY` (>= 32 chars, recommended 64 hex).
  Same value on both sides. In production it is stored in AWS Secrets Manager.
- TTL: 120 seconds (`exp - iat`).
- Token is single-use. Laravel MUST persist the `jti` and reject repeats.

### Header

```json
{
  "alg": "HS256",
  "typ": "JWT"
}
```

### Payload

```json
{
  "user_id": "usr-superadmin",
  "name": "Direccion General",
  "email": "director@sige.local",
  "issued_at": 1715800000,
  "expires_at": 1715800120,
  "iss": "sige",
  "aud": "manager-de-escritos",
  "sub": "usr-superadmin",
  "iat": 1715800000,
  "exp": 1715800120,
  "jti": "b1f8c9aa-0d3e-4f7b-9e34-d0e1f2c4a5b6"
}
```

Fields `user_id`, `name`, `email`, `issued_at`, `expires_at` follow the
APP-ORIGEN spec verbatim. The standard claims `iss`, `aud`, `sub`, `iat`, `exp`,
`jti` are added for replay protection and validation rigor.

## Required validation on Laravel

Reject the request and return `401` unless all of the following are true:

1. Signature verifies against `SSO_SECRET_KEY` using `HS256`.
2. `iss == "sige"`.
3. `aud == "manager-de-escritos"`.
4. `exp > now()` (use UTC seconds).
5. `iat <= now() + 60` (60s clock skew tolerance).
6. `jti` does not exist in the `sso_used_tickets` table. Insert it before
   creating the Laravel session so the same JWT cannot be reused.

## Reference Laravel implementation

### Composer dependency

```bash
composer require firebase/php-jwt
```

### Env vars

```env
SSO_SECRET_KEY=<same value as SIGE>
SSO_ISSUER=sige
SSO_AUDIENCE=manager-de-escritos
```

### Migration

```php
Schema::create('sso_used_tickets', function (Blueprint $table) {
    $table->string('jti')->primary();
    $table->timestamp('used_at')->useCurrent();
});
```

### Route

```php
Route::get('/auth/sso', [SsoController::class, 'callback']);
```

### Controller

```php
<?php

namespace App\Http\Controllers;

use App\Models\SsoUsedTicket;
use App\Models\User;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class SsoController extends Controller
{
    public function callback(Request $request)
    {
        $token = (string) $request->query('token', '');

        if ($token === '') {
            abort(401, 'Missing SSO token');
        }

        try {
            $claims = JWT::decode($token, new Key(env('SSO_SECRET_KEY'), 'HS256'));
        } catch (\Throwable $e) {
            abort(401, 'Invalid SSO token');
        }

        if (($claims->iss ?? null) !== env('SSO_ISSUER', 'sige')) {
            abort(401, 'Invalid issuer');
        }

        if (($claims->aud ?? null) !== env('SSO_AUDIENCE', 'manager-de-escritos')) {
            abort(401, 'Invalid audience');
        }

        if (!isset($claims->jti) || SsoUsedTicket::where('jti', $claims->jti)->exists()) {
            abort(401, 'Replayed SSO token');
        }

        DB::transaction(function () use ($claims) {
            SsoUsedTicket::create(['jti' => $claims->jti]);

            $user = User::updateOrCreate(
                ['email' => $claims->email],
                [
                    'name' => $claims->name,
                    'external_id' => $claims->user_id,
                ]
            );

            Auth::login($user, remember: true);
        });

        return redirect('/');
    }
}
```

## Operational checklist

- Keep `SSO_SECRET_KEY` in AWS Secrets Manager. Never commit it.
- Rotate the secret periodically. Rotation requires a coordinated deploy on
  both SIGE and Manager de Escritos because there is a single active key at a
  time.
- The Laravel side keeps its own login intact. The `/auth/sso` route is an
  additional entry point only.
- Auditing: SIGE writes an `AuditLog` row with `action = "sso.brief_manager.issued"`
  for every token. Manager de Escritos should add its own audit entry on each
  successful SSO login for traceability.
- Logout in SIGE does not propagate to Manager de Escritos. If a single
  back-channel logout is required later, expose a webhook on the Laravel side
  and have SIGE call it from its `/auth/logout` handler.
