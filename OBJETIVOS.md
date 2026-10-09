# Compras Hogar — Objetivos del proyecto

Asistente de compras para el hogar. Este documento fija **para qué existe** el proyecto, de modo que cada módulo y cada decisión técnica se pueda medir contra él.

## Visión

Llegar a un hogar donde las compras se resuelvan solas: la app sabe qué se consume, cuándo se va a acabar, dónde conviene comprarlo y cuánto, y arma (y algún día ejecuta) el pedido sin que nadie tenga que pensarlo.

## Objetivos

### 1. Eficiencia
Hacer las compras del hogar de la forma más eficiente posible: menos tiempo dedicado, menos viajes, menos decisiones manuales. Cada interacción con la app tiene que ahorrar más tiempo del que consume.

### 2. Que nunca falte nada
Evitar quiebres de stock en casa. El caso testigo: llegar un domingo a la noche y descubrir que no hay queso rallado. La app debe anticipar cuándo se va a terminar cada producto habitual y avisar (o reponer) antes de que pase.

### 3. Mínimo costo
Minimizar el gasto total, considerando:
- Promociones y descuentos (por supermercado, día, medio de pago, cantidad).
- En qué supermercado comprar cada cosa.
- Qué cantidades comprar para alcanzar mínimos de envío gratis o repartir costos de envío.
- El equilibrio entre stockearse (aprovechar precio) y no inmovilizar plata ni dejar vencer productos.

### 4. Automatizar todo lo posible
Cada paso manual es candidato a automatizarse. El norte de largo plazo: **no tener que hacer las compras**. Se avanza de a poco: primero registrar, después sugerir, después armar el pedido, y finalmente ejecutarlo con aprobación mínima.

### 5. Entender los patrones de consumo de la familia
Identificar qué se consume, con qué frecuencia, en qué cantidades, con qué estacionalidad y cómo cambia en el tiempo. Este conocimiento es la base de los objetivos 2, 3 y 4.

## Principios

- **Los datos son de la familia.** Todo lo que se registra queda en nuestra base y es exportable.
- **Un humano valida.** Mientras la automatización no sea confiable, nada entra a la base sin que alguien (Cesar o su pareja) lo confirme.
- **Normalizar antes de analizar.** Un mismo producto se llama distinto en cada supermercado; sin un identificador común no hay análisis posible.
- **Crecer según la necesidad.** Infraestructura (base de datos, IA, servicios externos) se suma cuando un módulo concreto la requiere, no antes.
- **IA donde suma.** Se evalúa caso por caso qué modelo usar (Claude u otro en la nube, o un modelo local en la máquina de Cesar), según costo, privacidad y calidad.

## Módulos

| # | Módulo | Qué hace | Objetivos que sirve |
|---|--------|----------|---------------------|
| 1 | **Lector de tickets** *(primera versión lista)* | Fotos de tickets (una o varias si es largo) → texto → normalización de productos → validación humana → guardado. | 4, 5 |
| 2 | **Precios de supermercados** | Precios de los supermercados más accesibles por distancia a casa, comparados contra nuestras compras habituales. | 3 |
| 3 | **Análisis de datos** | Gasto, consumo, frecuencias, evolución de precios, patrones familiares. | 5, 3 |
| 4 | **Predictivo y simulador** | Predice qué y cuándo hay que comprar; simula escenarios (dónde, cuánto, con qué promos) para minimizar gasto y evitar faltantes. | 2, 3, 1 |

### Módulo 1 — Lector de tickets (detalle)

1. **Captura:** una o varias fotos de un mismo ticket (los largos se sacan en partes).
2. **Extracción:** OCR / modelo de visión → texto estructurado (supermercado, fecha, ítems, cantidades, precios unitarios, descuentos, total, medio de pago).
3. **Normalización:** cada ítem se vincula a un producto canónico usando el código de barras nacional del producto (**EAN-13 / GTIN**, administrado en Argentina por GS1). Es el mismo identificador que usa el sistema oficial de precios (**SEPA / Precios Claros**), lo que conecta este módulo con el módulo 2. Cuando el ticket no trae el código, se busca por descripción y se propone el producto más probable.
4. **Validación humana:** pantalla para revisar y corregir ítems, productos asignados y totales. Las correcciones se recuerdan (ej.: "QSO RALL 150G" en tal súper = tal EAN) para que la próxima vez salga bien solo.
5. **Guardado:** ticket original (imágenes), texto extraído y datos validados quedan persistidos para el análisis.

**Criterio de éxito:** cargar un ticket real lleva menos de 2 minutos de intervención humana, y ese tiempo baja a medida que el sistema aprende.

## Stack

- **Repositorio:** GitHub (`compras-hogar`).
- **Despliegue:** Vercel.
- **Base de datos:** Neon (Postgres), incorporada cuando haga falta.
- **IA:** a definir por módulo. Lectura de tickets: Claude.
- **Fotos:** Vercel Blob (privado).
- **Acceso:** cada persona con su nombre y PIN.

## Preguntas abiertas

- Confirmar que el "sistema nacional de identificación" al que nos referimos es EAN/GTIN (GS1 Argentina) / Precios Claros.
- Ver con tickets reales de Coto y El Abastecedor si traen el EAN impreso o solo la descripción.
- Qué supermercados y sucursales entran en el radio de "accesibles por distancia".
