# Método

Cómo se obtiene cada número de MotionClin, con sus fórmulas, sus límites y la literatura en la que se apoya. El código correspondiente está en [`js/metrics.js`](../js/metrics.js).

## 1. De vídeo a trayectorias limpias

**Estimación de pose.** MediaPipe BlazePose (Bazarevsky et al., 2020) devuelve 33 puntos por fotograma con coordenadas normalizadas a la imagen y una visibilidad entre 0 y 1. Se usan los 13 puntos relevantes: nariz, hombros, caderas, rodillas, tobillos, talones y antepiés.

**Remuestreo.** Si los intervalos entre fotogramas varían más de un 10 % (cámara en directo), se remuestrea a una frecuencia uniforme por interpolación lineal. La frecuencia se estima como $(n-1)/(t_n - t_1)$ y no como la mediana de los intervalos, que se sesga cuando los tiempos están redondeados.

**Corrección izquierda/derecha.** Los modelos 2D confunden a veces las piernas cuando se cruzan. Para cada fotograma se predice la posición de rodillas, tobillos, talones y antepiés por extrapolación lineal de los dos anteriores y se comparan dos costes: etiquetas tal cual y etiquetas intercambiadas. Si intercambiar reduce el coste a menos de la mitad, se corrige. Si hay que corregir más de la mitad de los fotogramas, la referencia inicial era la errónea y se invierte toda la secuencia.

**Limpieza.** Se descartan los puntos con visibilidad < 0,5. En marcha se descartan también los fotogramas en los que el muslo o la pierna cambian de longitud aparente más de un 25 % respecto a su mediana (un hueso no se estira). Los huecos de hasta 0,25 s se interpolan linealmente.

**Filtrado.** Butterworth paso bajo de 2.º orden aplicado hacia delante y hacia atrás (fase cero, 4.º orden efectivo). La doble pasada desplaza la frecuencia de corte, así que se diseña con la corrección de Winter (2009):

$$f_{diseño} = \frac{f_c}{0{,}802}$$

con $f_c$ = 6 Hz en marcha, 4 Hz en sentadilla y silla, y 3 Hz en equilibrio.

## 2. Ángulos

- **Flexión de rodilla:** $\theta_{rodilla} = 180° - \angle(\text{cadera}, \text{rodilla}, \text{tobillo})$; 0° es la extensión completa.
- **Flexión de cadera:** ángulo del muslo respecto a la prolongación del tronco (hombros → caderas), con signo positivo cuando la rodilla está por delante en la dirección de la marcha.
- **Inclinación del tronco:** ángulo de la recta caderas → hombros respecto a la vertical.
- **Flexión de rodilla en vista frontal** (sentadilla): la flexión no se ve en el plano de la imagen, así que se estima por el acortamiento aparente de muslo y pierna, siendo $L_0$ su longitud de pie:

$$\theta \approx \arccos\frac{L_{muslo}}{L_{muslo,0}} + \arccos\frac{L_{pierna}}{L_{pierna,0}}$$

- **Valgo dinámico (FPPA):** ángulo entre muslo y pierna en el plano frontal en el punto más bajo de cada repetición (Munro et al., 2012), positivo cuando la rodilla se desplaza hacia la línea media.

## 3. Marcha

**Eventos** (Zeni et al., 2008). En cada tramo de marcha en una dirección (se excluyen giros y paradas):

- Contacto inicial: máximo local de $(x_{talón} - x_{pelvis}) \cdot d$
- Despegue: mínimo local de $(x_{antepié} - x_{pelvis}) \cdot d$

siendo $d = \pm 1$ la dirección de la marcha. La posición del pico se refina con interpolación parabólica para obtener precisión por debajo de un fotograma.

**Variables espaciotemporales**, por zancada (de un contacto al siguiente del mismo pie):

| Variable | Definición |
|---|---|
| Duración de la zancada | $T = t_{HS,k+1} - t_{HS,k}$ |
| Cadencia | $120 / T$ pasos/min |
| Fase de apoyo | $(t_{TO} - t_{HS}) / T \times 100$ |
| Doble apoyo | suma de los dos periodos con ambos pies en el suelo, en % del ciclo |
| Longitud de zancada | desplazamiento de la pelvis entre contactos × escala |
| Velocidad | longitud de zancada / $T$ |

**Escala espacial.** Sin calibración, la distancia hombro–tobillo en píxeles se relaciona con la talla: hombro ≈ 0,818 × talla y tobillo ≈ 0,039 × talla (Drillis y Contini, 1966), de modo que

$$\text{escala (m/px)} = \frac{0{,}779 \cdot \text{talla}}{\text{hombro–tobillo (px)}}$$

Supone cámara fija y perpendicular a la marcha.

**Marcha en cinta.** Si la pelvis apenas se desplaza (rango < 0,6 × altura aparente) pero los pies se alternan por delante y por detrás de ella, el registro completo se trata como un único tramo y la dirección se toma de la orientación de los pies (antepié respecto al talón). Los eventos se detectan igual, porque el método de Zeni usa posiciones relativas a la pelvis y se diseñó para cinta. La velocidad no se puede medir desde la imagen: si el clínico introduce la de la cinta, $L_{zancada} = v_{cinta} \cdot T$ y $L_{paso} = v_{cinta} \cdot t_{paso}$.

**Tira de fases.** Para la primera zancada completa se muestran el contacto inicial (0 %), la respuesta a la carga (12 %), el apoyo medio (30 %), el despegue detectado y la oscilación media (85 %), siguiendo la división de Perry y Burnfield (2010).

**Curvas por ciclo.** Cada zancada se remuestrea a 51 puntos (0–100 % en pasos del 2 %) y se promedia por lado. La desviación respecto a una curva normal de referencia (forma basada en Winter, 2009, y Kadaba et al., 1990) se resume con el Gait Variable Score (Baker et al., 2009):

$$GVS = \sqrt{\frac{1}{51}\sum_{i=1}^{51}\left(\theta_i - \theta_i^{ref}\right)^2}$$

**Simetría** (índice de Robinson et al., 1987), 0 % = simetría perfecta:

$$IS = \frac{|D - I|}{0{,}5\,(D + I)} \times 100$$

**Variabilidad:** coeficiente de variación de la duración de la zancada, $CV = DE/\bar{T} \times 100$ (Hausdorff, 2005).

## 4. Sentadilla, silla y equilibrio

**Sentadilla.** Repeticiones sobre la flexión media de ambas rodillas: empieza al superar el 60 % del rango y termina al bajar del 30 %; inicio y final se sitúan al 10 % del rango. Las métricas se miden en el punto más bajo de cada repetición.

**Levantarse de la silla ×5.** La altura de la pelvis se normaliza entre sentado (0 %) y de pie (100 %). Una repetición es el paso de < 15 % a > 85 %. El tiempo de la prueba va desde el inicio de la primera subida hasta alcanzar la bipedestación en la quinta.

**Equilibrio.** Modelo de péndulo invertido (Winter, 1995): ángulo de la recta tobillos → hombros respecto a la vertical, menos su media. Velocidad de oscilación = recorrido angular / tiempo; RMS; rango del 95 %. La incertidumbre se estima con ventanas de 5 s. El apoyo monopodal se detecta cuando un tobillo está más de un 4 % de la altura aparente por encima del otro.

## 5. Incertidumbre y fiabilidad

Cada variable se da como **media ± DE** entre ciclos, repeticiones o ventanas, con su **n**. Además lleva un nivel de fiabilidad:

| Nivel | Condiciones |
|---|---|
| Alta | Vista adecuada para la variable, visibilidad media del lado ≥ 0,8 y al menos 4 ciclos (3 repeticiones) |
| Media | 2–3 ciclos, vista oblicua, visibilidad 0,6–0,8 o variables sensibles al error 2D (fase de apoyo y doble apoyo, por el retraso típico del despegue) |
| Baja | 1 ciclo, vista inadecuada o visibilidad < 0,6. **No genera alertas** |

## 6. Comparación entre sesiones

Para cada variable con valores por ciclo en ambas sesiones:

**Prueba t de Welch** (Welch, 1947), que no asume varianzas iguales:

$$t = \frac{\bar{x}_B - \bar{x}_A}{\sqrt{s_A^2/n_A + s_B^2/n_B}}, \qquad
\nu = \frac{\left(s_A^2/n_A + s_B^2/n_B\right)^2}{\frac{(s_A^2/n_A)^2}{n_A-1} + \frac{(s_B^2/n_B)^2}{n_B-1}}$$

El valor p bilateral se calcula con la función beta incompleta regularizada: $p = I_{\nu/(\nu+t^2)}(\nu/2,\ 1/2)$.

**Tamaño del efecto:** $d = (\bar{x}_B - \bar{x}_A) / s_{pooled}$.

**Cambio real** = $p < 0{,}05$ **y** $|\Delta| \geq$ cambio mínimo relevante de la variable:

| Variable | Cambio mínimo | Fuente |
|---|---|---|
| Velocidad de marcha | 0,10 m/s | Perera et al., 2006 (cambio sustancial) |
| Ángulos articulares | 5° | del orden del error de la medición 2D |
| Cadencia | 5 pasos/min | orientativo |
| Fase de apoyo, doble apoyo | 3 % del ciclo | orientativo |
| Valgo dinámico (FPPA) | 3° | orientativo |
| Oscilación postural | 20 % del valor inicial | orientativo |

Así se evita llamar «mejora» a diferencias estadísticamente significativas pero clínicamente irrelevantes, frecuentes cuando hay muchos ciclos con poca variabilidad.

**Tendencia** (3 o más sesiones): regresión lineal de la métrica principal frente a las semanas transcurridas, con el valor p de la pendiente y R².

## 7. Valores de referencia

### Marcha: datos de laboratorio emparejados por velocidad

La curva de rodilla, la banda del muslo, la cadencia, la fase de apoyo y el doble apoyo se comparan con los **datos normativos de laboratorio de Bovi et al. (2011)**: captura óptica 3D de 111 jóvenes (6–17 años) y 124 adultos (22–72 años) sanos, con medias y DE cada 2 % del ciclo. Los autores los publicaron como material suplementario del artículo.

Como la cinemática de la marcha cambia mucho con la velocidad (más lento = menos flexión de rodilla y más doble apoyo), MotionClin elige el subconjunto que corresponde al paciente:

1. **Grupo** por edad: jóvenes si < 18 años, adultos en otro caso.
2. **Clase de velocidad** con la velocidad normalizada por la talla, $v_{BH} = 100 \cdot v / h$ (% de la altura por segundo), la clase cuya media está más cerca:

| Clase (adultos) | $v_{BH}$ (%/s) | Cadencia (pasos/min) | Despegue (% ciclo) | Doble apoyo (%) |
|---|---|---|---|---|
| Muy lenta (XS) | 49 ± 7 | 88 ± 11 | 66,2 ± 2,2 | 30,9 ± 3,8 |
| Lenta (S) | 70 ± 6 | 110 ± 7 | 63,3 ± 1,8 | 25,6 ± 3,0 |
| Media (M) | 87 ± 6 | 123 ± 8 | 62,3 ± 2,5 | 23,9 ± 4,6 |
| Rápida (L) | 115 ± 8 | 141 ± 11 | 59,6 ± 2,2 | 18,8 ± 4,0 |
| Libre | 71 ± 10 | 110 ± 9 | 63,2 ± 2,0 | 25,3 ± 3,2 |

Sin velocidad (sin talla y fuera de cinta) se usa la velocidad libre. El rango de normalidad de cada variable es **media ± 2 DE**. Así se evita marcar como anormal una rodilla de 50° en alguien que camina despacio, cuando eso es lo esperable a esa velocidad. Con el vídeo real de ejemplo, la fase de apoyo y el doble apoyo, que salían «altos» frente a un rango fijo, quedan dentro del rango de su velocidad.

### Resto de variables

| Variable | Referencia | Fuente |
|---|---|---|
| Velocidad de marcha | media por edad y sexo; alerta < 85 % de la media o < 1,0 m/s | Bohannon y Williams Andrews, 2011; Fritz y Lusardi, 2009 |
| Cadencia, apoyo, doble apoyo, rodilla, muslo | media ± 2 DE de la clase de velocidad (ver arriba) | Bovi et al., 2011 |
| Variabilidad de la zancada | CV < 3 % | Hausdorff, 2005 |
| Asimetría | IS < 10 % | umbral habitual |
| Levantarse de la silla ×5 | 11,4 / 12,6 / 14,8 s (60–69 / 70–79 / 80–89 años); > 15 s asociado a caídas | Bohannon, 2006; Buatois et al., 2008 |
| Apoyo monopodal (ojos abiertos) | media por edad (43,5 s a 18–39 años … 6,2 s a 80–99) | Springer et al., 2007 |
| Valgo dinámico | −5 a 10° (orientativo) | Munro et al., 2012 |
| Oscilación angular | sin norma validada para este método: solo seguimiento | — |

## 8. Concordancia con un laboratorio

[`validacion/`](../validacion/README.md) contiene el análisis para comparar MotionClin con un sistema de referencia y el protocolo del estudio. Con $d_i = x_{MC,i} - x_{lab,i}$:

- **Bland-Altman:** sesgo $\bar d$ con IC 95 % y límites de acuerdo $\bar d \pm 1{,}96\, s_d$; sesgo proporcional como pendiente de $d$ frente a la media de ambos métodos.
- **ICC** a partir de los cuadrados medios del ANOVA sujetos × métodos ($MS_R$, $MS_C$, $MS_E$; $n$ sujetos, $k$ métodos):

$$ICC(2,1) = \frac{MS_R - MS_E}{MS_R + (k-1)MS_E + \frac{k}{n}(MS_C - MS_E)}, \qquad ICC(3,1) = \frac{MS_R - MS_E}{MS_R + (k-1)MS_E}$$

  con IC 95 % por *bootstrap* de sujetos (2000 remuestras) e interpretación de Koo y Li (2016) sobre el límite inferior. La implementación reproduce el ejemplo de Shrout y Fleiss (1979) en las pruebas.
- **Curvas:** RMSE entre curvas medias del ciclo y coeficiente de correlación múltiple (Kadaba et al., 1989).
- **Test-retest:** $SEM = s_d/\sqrt 2$ y $MDC_{95} = 1{,}96\sqrt 2 \cdot SEM$ (Weir, 2005).

## 9. Límites

- **2D.** Los ángulos fuera del plano de la cámara se proyectan y se deforman; por eso cada prueba pide una vista concreta y la fiabilidad baja cuando la vista no es la adecuada.
- **Puntos del modelo, no marcadores.** BlazePose estima posiciones de articulaciones a partir de la imagen; frente a sistemas optoelectrónicos 3D el error típico es de varios grados.
- **Escala por talla.** Las distancias y la velocidad dependen de la talla introducida y de que la cámara esté perpendicular a la marcha.
- **Referencias de laboratorio 3D.** Las de marcha son de captura óptica 3D y las de MotionClin son 2D: un sesgo de unos grados frente a ellas es esperable. Sirven para contextualizar, no para diagnosticar.
- **Verificación, no validación.** [`VALIDACION.md`](../VALIDACION.md) demuestra que el procesado recupera los valores verdaderos cuando la pose es conocida. Cuantificar el error del modelo de pose requiere un estudio frente a un sistema de referencia, que está preparado en [`validacion/`](../validacion/README.md).

## Referencias

1. Baker R, McGinley JL, Schwartz MH, et al. The Gait Profile Score and Movement Analysis Profile. *Gait Posture*. 2009;30(3):265-9.
2. Bazarevsky V, Grishchenko I, Raveendran K, et al. BlazePose: On-device real-time body pose tracking. arXiv:2006.10204; 2020.
3. Bland JM, Altman DG. Statistical methods for assessing agreement between two methods of clinical measurement. *Lancet*. 1986;1(8476):307-10.
4. Bohannon RW, Williams Andrews A. Normal walking speed: a descriptive meta-analysis. *Physiotherapy*. 2011;97(3):182-9.
5. Bohannon RW. Reference values for the five-repetition sit-to-stand test: a descriptive meta-analysis of data from elders. *Percept Mot Skills*. 2006;103(1):215-22.
6. Bovi G, Rabuffetti M, Mazzoleni P, Ferrarin M. A multiple-task gait analysis approach: kinematic, kinetic and EMG reference data for healthy young and adult subjects. *Gait Posture*. 2011;33(1):6-13.
7. Buatois S, Miljkovic D, Manckoundia P, et al. Five times sit to stand test is a predictor of recurrent falls in healthy community-living subjects aged 65 and older. *J Am Geriatr Soc*. 2008;56(8):1575-7.
8. Drillis R, Contini R. Body segment parameters. Technical Report 1166-03. New York University; 1966.
9. Fritz S, Lusardi M. White paper: "Walking speed: the sixth vital sign". *J Geriatr Phys Ther*. 2009;32(2):46-9.
10. Hausdorff JM. Gait variability: methods, modeling and meaning. *J Neuroeng Rehabil*. 2005;2:19.
11. Kadaba MP, Ramakrishnan HK, Wootten ME, et al. Repeatability of kinematic, kinetic, and electromyographic data in normal adult gait. *J Orthop Res*. 1989;7(6):849-60.
12. Kadaba MP, Ramakrishnan HK, Wootten ME. Measurement of lower extremity kinematics during level walking. *J Orthop Res*. 1990;8(3):383-92.
13. Koo TK, Li MY. A guideline of selecting and reporting intraclass correlation coefficients for reliability research. *J Chiropr Med*. 2016;15(2):155-63.
14. McGraw KO, Wong SP. Forming inferences about some intraclass correlation coefficients. *Psychol Methods*. 1996;1(1):30-46.
15. Munro A, Herrington L, Carolan M. Reliability of 2-dimensional video assessment of frontal-plane dynamic knee valgus during common athletic screening tasks. *J Sport Rehabil*. 2012;21(1):7-11.
16. Perera S, Mody SH, Woodman RC, Studenski SA. Meaningful change and responsiveness in common physical performance measures in older adults. *J Am Geriatr Soc*. 2006;54(5):743-9.
17. Perry J, Burnfield JM. *Gait Analysis: Normal and Pathological Function*. 2.ª ed. Thorofare: SLACK; 2010.
18. Robinson RO, Herzog W, Nigg BM. Use of force platform variables to quantify the effects of chiropractic manipulation on gait symmetry. *J Manipulative Physiol Ther*. 1987;10(4):172-6.
19. Shrout PE, Fleiss JL. Intraclass correlations: uses in assessing rater reliability. *Psychol Bull*. 1979;86(2):420-8.
20. Springer BA, Marin R, Cyhan T, Roberts H, Gill NW. Normative values for the unipedal stance test with eyes open and closed. *J Geriatr Phys Ther*. 2007;30(1):8-15.
21. Weir JP. Quantifying test-retest reliability using the intraclass correlation coefficient and the SEM. *J Strength Cond Res*. 2005;19(1):231-40.
22. Welch BL. The generalization of "Student's" problem when several different population variances are involved. *Biometrika*. 1947;34(1-2):28-35.
23. Winter DA. *Biomechanics and Motor Control of Human Movement*. 4.ª ed. Hoboken: Wiley; 2009.
24. Winter DA. Human balance and posture control during standing and walking. *Gait Posture*. 1995;3(4):193-214.
25. Zeni JA, Richards JG, Higginson JS. Two simple methods for determining gait events during treadmill and overground walking using kinematic data. *Gait Posture*. 2008;27(4):710-4.
