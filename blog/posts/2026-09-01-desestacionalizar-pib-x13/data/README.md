# Datos de la historia X-13

La preparación del modelo X-13 exportó dos archivos equivalentes. El documento
`../x13-story.qmd` solamente los lee; su render no ejecuta R ni recalcula el
modelo:

- `x13-series.csv`: tabla ancha para inspección y reutilización.
- `x13-series.json`: la misma información, acompañada de metadatos e
  identidades contables, para la visualización web.

`x13-scenes.json` es independiente de esos valores: declara las columnas,
escalas, colores, textos, fórmulas, líneas y transiciones que utiliza la
historia. El motor de `../x13-story.js` puede reutilizarse con otra serie si el
nuevo archivo de configuración indica sus respectivos nombres de columnas.

Las series `growth_observed` y `growth_adjusted` se calculan en el navegador a
partir de las columnas logarítmicas exportadas, usando la fórmula de variación
trimestral del capítulo 7. Es una transformación descriptiva de los resultados
estáticos; no vuelve a estimar el regARIMA ni la descomposición SEATS.

Cada escena combina una escala principal con una o más `lines`. Las propiedades
opcionales `connector` y `eventSeries` hacen visibles las diferencias entre dos
series y los eventos fechados. `strips` reserva bandas auxiliares para
componentes de menor magnitud —como la estacionalidad, el irregular o las
innovaciones— sin mezclarlos con el eje de la trayectoria principal. Los
enlaces de cierre se declaran en `downloads`; el documento y el motor no
contienen nombres de columnas específicos del PIB.

## Columnas

| Columna | Significado |
|---|---|
| `date`, `trimestre` | Fecha y trimestre de la observación. |
| `Y` | PIB observado en la escala original. |
| `y` | `log(Y)`, serie observada entregada a X-13. |
| `XB` | Efecto total de regresión: `C + L + A`. |
| `C` | Efectos de calendario. |
| `L` | Suma de cambios de nivel (`LS`). |
| `A` | Suma de outliers aditivos (`AO`). |
| `z` | Serie linealizada: `y - XB`. |
| `T_lin`, `S_lin`, `I_lin` | Componentes estimados por SEATS sobre `z`. |
| `z_SA` | Ajuste interno: `T_lin + I_lin`. |
| `T_final` | Tendencia-ciclo final: `T_lin + L`. |
| `I_final` | Irregular final: `I_lin + A`. |
| `y_SA_final` | Serie desestacionalizada final en logaritmos. |
| `Y_SA_final` | Serie desestacionalizada final en la escala original. |
| `epsilon` | Innovaciones del regARIMA. |
| `evento` | Etiqueta `AO` o `LS` cuando corresponde. |

Los archivos se derivan de la serie del Banco Central
`F032.PIB.FLU.R.CLP.EP18.Z.Z.0.T`, limitada al segundo trimestre de 2026.
