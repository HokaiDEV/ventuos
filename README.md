# ventuos
Neumorphic UI Demo
===================

Como usar
---------

1) Abra o arquivo `index.html` no seu navegador.
2) A folha de estilos `styles.css` aplica a estética Neumórfica:
   - Fundo cinza claro `#e0e0e0` (mesmo material em todos os elementos)
   - Sombreamento duplo suave (claro/escuro) para relevo
   - Paleta monocromática com realce primário sutil
   - Sem bordas duras; cantos arredondados e baixo relevo

Conteúdo da demo
----------------

- Botões (padrão, primário, ícone) com efeito "pressed" ao clicar
- Inputs, selects e checkbox com relevo interno
- Cards/painéis e lista com sensação tátil
- Toggle e controle de modo escuro suave (apenas visual)

Personalização
--------------

Ajuste tokens no `:root` do `styles.css`:

```
--surface, --text, --primary, --radius, --elev-1..3, --shadow-*
```

Modo escuro: alterna a classe `dark` no `html` para ativar variáveis específicas.

Integração
----------

Copie `styles.css` para seu projeto e referencie-o. Estruture seus elementos com as classes utilizadas na demo (`btn`, `card`, `panel`, `input`, etc.).
