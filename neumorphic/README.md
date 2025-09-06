Neumorphic UI Demo

Descrição
- UI com aparência Neumórfica (soft, extrudada) usando paleta monocromática.
- Sombras duplas (clara e escura) criam sensação tátil e volume.
- Sem bordas duras, elementos parecem esculpidos do mesmo material do fundo (#e0e0e0).

Uso
1. Abra `index.html` no navegador.
2. Ajuste os controles na barra para alterar profundidade (elevation), desfoque (blur) e raio.

Tokens (CSS Variables)
- `--bg`: cor de fundo base (padrão `#e0e0e0`).
- `--shadow-dark`: sombra escura (padrão `#bebebe`).
- `--shadow-light`: luz superior (padrão `#ffffff`).
- `--elevation`: deslocamento da sombra (px).
- `--blur`: desfoque das sombras (px).
- `--radius`: raio de borda.

Classes principais
- `.neu`: base com sombras elevadas.
- `.neu.is-pressed`: versão pressionada (inset), usada também em `:active`.
- `.btn`, `.input`, `.card`, `.switch`, `.checkbox`: componentes exemplo.

Interação
- Botões possuem efeito pressed ao clicar.
- Inputs entram em modo inset ao focar.
- Switch alterna o knob com sombra invertida ao ativar.

Observações
- Mantém aspecto monocromático e discreto; evite cores saturadas para preservar o estilo.

