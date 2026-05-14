# Windows Terminal / Cursor — UTF-8

O Setup Boss grava artifacts como **UTF-8** (UTF-8 válido, sem depender do code page do terminal).

Mojibake no terminal como `Ã§Ã£o`, `alteraÃ§Ãµes` ou `determinÃstico` costuma significar que **bytes UTF-8** da saída do processo foram **renderizados** como **Windows-1252** ou **CP850** (console OEM). Isso afeta a **visualização** no terminal — **não** implica que os arquivos em disco estejam corrompidos.

**Não copie** trechos com mojibake do terminal para usar em `search` / `replace` de patches; use o conteúdo lido do arquivo com encoding correto.

## Sessão atual (PowerShell)

```powershell
chcp 65001
$OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
```

## Persistir no perfil do PowerShell

Abra o perfil:

```powershell
notepad $PROFILE
```

Adicione (ou ajuste):

```powershell
$OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
```

## Ler artifacts com UTF-8

```powershell
Get-Content .\arquivo.json -Encoding UTF8
```

## Diagnóstico rápido

```powershell
chcp
$OutputEncoding
[Console]::OutputEncoding
[System.Text.Encoding]::Default.CodePage
```

## Como interpretar

- Se `node -e "…"` ler o ficheiro como `utf8` e mostrar acentos corretos, o artifact em disco está correto.
- Se `cat`/saída bruta no terminal mostrar `Ã§Ã£o`, trata-se sobretudo de **renderização** no terminal — compare com `Get-Content -Encoding UTF8` ou com Node.
