/**
 * Injecte 3 graphiques natifs Excel dans un buffer XLSX généré par ExcelJS.
 *
 * Approche : un fichier XLSX est une archive ZIP contenant du XML OOXML.
 * ExcelJS ne supporte pas la création de graphiques, mais JSZip (dépendance
 * transitive d'ExcelJS) permet de post-traiter le buffer et d'y ajouter les
 * fichiers XML requis (chart, drawing, relations, content types).
 *
 * Les 3 graphiques ciblent la feuille "📊 Synthèse RH" :
 *   1. Camembert  — Répartition ponctualité employés
 *   2. Barres     — Taux de ponctualité par employé (top 10)
 *   3. Colonnes   — Retards cumulés (top 5)
 */

import JSZip from 'jszip';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ChartInput {
  /** Employés n'ayant aucun jour de retard */
  neverLate: number;
  /** Employés avec 1 à 3 jours de retard */
  sometimesLate: number;
  /** Employés avec plus de 3 jours de retard */
  oftenLate: number;
  /** Classement ponctualité, rate en % (ex. 95.5), 10 max */
  punctualityRanking: Array<{ name: string; rate: number }>;
  /** Classement retards, totalLateMin en minutes, 5 max */
  lateRanking: Array<{ name: string; totalLateMin: number }>;
}

// ── Helpers XML ───────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function strLit(items: string[]): string {
  const pts = items
    .map((v, i) => `<c:pt idx="${i}"><c:v>${esc(v)}</c:v></c:pt>`)
    .join('');
  return `<c:strLit><c:ptCount val="${items.length}"/>${pts}</c:strLit>`;
}

function numLit(values: number[], fmt = 'General'): string {
  const pts = values
    .map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`)
    .join('');
  return (
    `<c:numLit><c:formatCode>${fmt}</c:formatCode>` +
    `<c:ptCount val="${values.length}"/>${pts}</c:numLit>`
  );
}

function chartTitle(text: string): string {
  return (
    `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/>` +
    `<a:p><a:pPr><a:defRPr b="1" sz="1100"/></a:pPr>` +
    `<a:r><a:rPr lang="fr-FR" b="1"/><a:t>${esc(text)}</a:t></a:r>` +
    `</a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`
  );
}

const NS = [
  `xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"`,
  `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"`,
  `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"`,
].join(' ');

function chartSpace(body: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<c:chartSpace ${NS}>\n<c:roundedCorners val="0"/>\n${body}\n` +
    `<c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>` +
    `<a:ln><a:solidFill><a:srgbClr val="D9E1F2"/></a:solidFill></a:ln></c:spPr>\n` +
    `</c:chartSpace>`
  );
}

function solidFill(hex: string): string {
  return `<a:solidFill><a:srgbClr val="${hex}"/></a:solidFill>`;
}

// ── Graphique 1 : Camembert — Répartition ponctualité ────────────────────────

function buildPieChart(input: ChartInput): string {
  const categories: string[] = [];
  const values: number[] = [];
  const colors = ['4CAF50', 'FF9800', 'F44336'] as const;
  const raw = [
    { label: 'Jamais en retard', v: input.neverLate },
    { label: 'Parfois (1–3 jours)', v: input.sometimesLate },
    { label: 'Souvent (> 3 jours)', v: input.oftenLate },
  ];

  // Exclure les catégories vides (distort graph)
  raw
    .filter((x) => x.v > 0)
    .forEach((x) => {
      categories.push(x.label);
      values.push(x.v);
    });

  if (categories.length === 0) {
    categories.push('Aucun retard');
    values.push(1);
  }

  const dpt = categories
    .map(
      (_, i) =>
        `<c:dPt><c:idx val="${i}"/><c:bubble3D val="0"/>` +
        `<c:spPr>${solidFill(colors[i] ?? '9E9E9E')}</c:spPr></c:dPt>`,
    )
    .join('');

  const dLbls =
    `<c:dLbls>` +
    `<c:spPr><a:noFill/></c:spPr>` +
    `<c:txPr><a:bodyPr/><a:lstStyle/>` +
    `<a:p><a:pPr><a:defRPr b="1" sz="900"/></a:pPr></a:p></c:txPr>` +
    `<c:showLegendKey val="0"/><c:showVal val="0"/>` +
    `<c:showCatName val="0"/><c:showSerName val="0"/>` +
    `<c:showPercent val="1"/><c:showBubbleSize val="0"/>` +
    `</c:dLbls>`;

  const ser =
    `<c:ser><c:idx val="0"/><c:order val="0"/>${dpt}${dLbls}` +
    `<c:cat>${strLit(categories)}</c:cat>` +
    `<c:val>${numLit(values)}</c:val></c:ser>`;

  const chart =
    `<c:chart>${chartTitle('Répartition de la ponctualité')}` +
    `<c:autoTitleDeleted val="0"/>` +
    `<c:plotArea><c:layout/>` +
    `<c:pieChart><c:varyColors val="1"/>${ser}<c:firstSliceAng val="0"/></c:pieChart>` +
    `</c:plotArea>` +
    `<c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend>` +
    `<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/>` +
    `</c:chart>`;

  return chartSpace(chart);
}

// ── Graphique 2 : Barres horizontales — Ponctualité par employé ──────────────

function buildBarChart(input: ChartInput): string {
  // Top 10, affiché du plus ponctuel en haut — on inverse pour axe bottom→top
  const items = [...input.punctualityRanking.slice(0, 10)].reverse();
  const names = items.map((e) => truncate(e.name, 22));
  const rates = items.map((e) => parseFloat((e.rate / 100).toFixed(4)));

  const ser =
    `<c:ser><c:idx val="0"/><c:order val="0"/>` +
    `<c:spPr>${solidFill('4472C4')}</c:spPr>` +
    `<c:cat>${strLit(names)}</c:cat>` +
    `<c:val>${numLit(rates, '0%')}</c:val></c:ser>`;

  const axes =
    `<c:catAx>` +
    `<c:axId val="2001"/><c:scaling><c:orientation val="minMax"/></c:scaling>` +
    `<c:delete val="0"/><c:axPos val="l"/>` +
    `<c:numFmt formatCode="General" sourceLinked="0"/>` +
    `<c:tickLblPos val="nextTo"/>` +
    `<c:spPr><a:ln><a:noFill/></a:ln></c:spPr>` +
    `<c:crossAx val="2002"/><c:crosses val="autoZero"/>` +
    `</c:catAx>` +
    `<c:valAx>` +
    `<c:axId val="2002"/><c:scaling><c:orientation val="minMax"/></c:scaling>` +
    `<c:delete val="0"/><c:axPos val="b"/>` +
    `<c:numFmt formatCode="0%" sourceLinked="0"/>` +
    `<c:tickLblPos val="nextTo"/>` +
    `<c:spPr><a:ln><a:noFill/></a:ln></c:spPr>` +
    `<c:crossAx val="2001"/><c:crosses val="autoZero"/>` +
    `<c:crossBetween val="between"/>` +
    `</c:valAx>`;

  const chart =
    `<c:chart>${chartTitle('Taux de ponctualité par employé')}` +
    `<c:autoTitleDeleted val="0"/>` +
    `<c:plotArea><c:layout/>` +
    `<c:barChart>` +
    `<c:barDir val="bar"/><c:grouping val="clustered"/><c:varyColors val="0"/>` +
    `${ser}<c:axId val="2001"/><c:axId val="2002"/>` +
    `</c:barChart>${axes}` +
    `</c:plotArea>` +
    `<c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend>` +
    `<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/>` +
    `</c:chart>`;

  return chartSpace(chart);
}

// ── Graphique 3 : Colonnes — Top 5 retards ───────────────────────────────────

function buildColumnChart(input: ChartInput): string {
  const items = input.lateRanking.slice(0, 5);
  if (items.length === 0) return buildPieChart(input); // fallback

  const names = items.map((e) => truncate(e.name, 18));
  const values = items.map((e) => Math.round(e.totalLateMin));

  const ser =
    `<c:ser><c:idx val="0"/><c:order val="0"/>` +
    `<c:spPr>${solidFill('C0392B')}</c:spPr>` +
    `<c:cat>${strLit(names)}</c:cat>` +
    `<c:val>${numLit(values, '0')}</c:val></c:ser>`;

  const axes =
    `<c:catAx>` +
    `<c:axId val="3001"/><c:scaling><c:orientation val="minMax"/></c:scaling>` +
    `<c:delete val="0"/><c:axPos val="b"/>` +
    `<c:numFmt formatCode="General" sourceLinked="0"/>` +
    `<c:tickLblPos val="nextTo"/>` +
    `<c:spPr><a:ln><a:noFill/></a:ln></c:spPr>` +
    `<c:crossAx val="3002"/><c:crosses val="autoZero"/>` +
    `</c:catAx>` +
    `<c:valAx>` +
    `<c:axId val="3002"/><c:scaling><c:orientation val="minMax"/></c:scaling>` +
    `<c:delete val="0"/><c:axPos val="l"/>` +
    `<c:numFmt formatCode="0" sourceLinked="0"/>` +
    `<c:tickLblPos val="nextTo"/>` +
    `<c:spPr><a:ln><a:noFill/></a:ln></c:spPr>` +
    `<c:crossAx val="3001"/><c:crosses val="autoZero"/>` +
    `<c:crossBetween val="between"/>` +
    `</c:valAx>`;

  const chart =
    `<c:chart>${chartTitle('Top 5 — Retards cumulés (min)')}` +
    `<c:autoTitleDeleted val="0"/>` +
    `<c:plotArea><c:layout/>` +
    `<c:barChart>` +
    `<c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>` +
    `${ser}<c:axId val="3001"/><c:axId val="3002"/>` +
    `</c:barChart>${axes}` +
    `</c:plotArea>` +
    `<c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend>` +
    `<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/>` +
    `</c:chart>`;

  return chartSpace(chart);
}

// ── Drawing XML (ancrage des graphiques sur la feuille) ───────────────────────
//
//   Positions (0-indexed col/row) — graphiques à droite des tableaux RH :
//     Graphique 1 : J2  → R19  (pie)
//     Graphique 2 : J21 → R40  (barres)
//     Graphique 3 : J42 → R57  (colonnes)

function twoCellAnchor(
  id: number,
  name: string,
  rId: string,
  fc: number,
  fr: number,
  tc: number,
  tr: number,
): string {
  return (
    `<xdr:twoCellAnchor moveWithCells="0" sizeWithCells="0">` +
    `<xdr:from><xdr:col>${fc}</xdr:col><xdr:colOff>0</xdr:colOff>` +
    `<xdr:row>${fr}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>` +
    `<xdr:to><xdr:col>${tc}</xdr:col><xdr:colOff>0</xdr:colOff>` +
    `<xdr:row>${tr}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>` +
    `<xdr:graphicFrame macro="">` +
    `<xdr:nvGraphicFramePr>` +
    `<xdr:cNvPr id="${id}" name="${name}"/>` +
    `<xdr:cNvGraphicFramePr/>` +
    `</xdr:nvGraphicFramePr>` +
    `<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>` +
    `<a:graphic>` +
    `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">` +
    `<c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="${rId}"/>` +
    `</a:graphicData>` +
    `</a:graphic>` +
    `</xdr:graphicFrame><xdr:clientData/>` +
    `</xdr:twoCellAnchor>`
  );
}

function buildDrawingXml(): string {
  const nsDrawing = [
    `xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"`,
    `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"`,
    `xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"`,
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"`,
  ].join(' ');

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<xdr:wsDr ${nsDrawing}>\n` +
    twoCellAnchor(2, 'Chart Ponctualité', 'rId1', 9, 1, 17, 18) +
    '\n' +
    twoCellAnchor(3, 'Chart Employés', 'rId2', 9, 20, 17, 39) +
    '\n' +
    twoCellAnchor(4, 'Chart Retards', 'rId3', 9, 41, 17, 56) +
    '\n' +
    `</xdr:wsDr>`
  );
}

function buildDrawingRels(): string {
  const t =
    'http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart';
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="${t}" Target="../charts/chart1.xml"/>` +
    `<Relationship Id="rId2" Type="${t}" Target="../charts/chart2.xml"/>` +
    `<Relationship Id="rId3" Type="${t}" Target="../charts/chart3.xml"/>` +
    `</Relationships>`
  );
}

function emptyChartRels(): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`
  );
}

// ── Injecteur principal ───────────────────────────────────────────────────────

/**
 * Injecte les graphiques dans le buffer XLSX passé en entrée.
 * En cas d'erreur, retourne le buffer original (les graphiques sont un bonus).
 *
 * @param buffer        Buffer XLSX produit par ExcelJS
 * @param summarySheet  Nom exact de la feuille cible (doit exister dans le buffer)
 * @param input         Données calculées pour les graphiques
 */
export async function injectExcelCharts(
  buffer: Buffer,
  summarySheet: string,
  input: ChartInput,
): Promise<Buffer> {
  try {
    const zip = await JSZip.loadAsync(buffer);

    // ── 1. Trouver la feuille cible dans workbook.xml ─────────────────────────

    const wbXml: string = await zip.file('xl/workbook.xml')!.async('text');

    // Recherche de l'élément <sheet name="..."> correspondant
    const sheetElems: string[] = wbXml.match(/<sheet [^/]+\/>/g) ?? [];
    const targetElem = sheetElems.find((s) => s.includes(summarySheet));
    if (!targetElem) {
      console.warn(`[chart-injector] Feuille "${summarySheet}" introuvable.`);
      return buffer;
    }

    const rIdMatch = targetElem.match(/r:id="(rId\d+)"/);
    if (!rIdMatch) return buffer;
    const sheetRId = rIdMatch[1];

    // ── 2. Résoudre le fichier de la feuille ──────────────────────────────────

    const wbRels: string = await zip
      .file('xl/_rels/workbook.xml.rels')!
      .async('text');
    const relMatch = wbRels.match(
      new RegExp(`Id="${sheetRId}"[^>]*Target="([^"]+)"`),
    );
    if (!relMatch) return buffer;

    // Target est relatif à xl/ : "worksheets/sheet1.xml"
    const sheetTarget = relMatch[1].replace(/^(\.\/|\/+)/, '');
    const sheetFile = `xl/${sheetTarget}`; // "xl/worksheets/sheet1.xml"
    const sheetBase = sheetFile.split('/').pop()!; // "sheet1.xml"
    const sheetRelsDir = `xl/worksheets/_rels`;
    const sheetRelsPath = `${sheetRelsDir}/${sheetBase}.rels`;

    // ── 3. Injecter les fichiers chart XML ────────────────────────────────────

    zip.file('xl/charts/chart1.xml', buildPieChart(input));
    zip.file('xl/charts/chart2.xml', buildBarChart(input));
    zip.file('xl/charts/chart3.xml', buildColumnChart(input));
    zip.file('xl/charts/_rels/chart1.xml.rels', emptyChartRels());
    zip.file('xl/charts/_rels/chart2.xml.rels', emptyChartRels());
    zip.file('xl/charts/_rels/chart3.xml.rels', emptyChartRels());

    // ── 4. Injecter le drawing XML ────────────────────────────────────────────

    zip.file('xl/drawings/drawing1.xml', buildDrawingXml());
    zip.file('xl/drawings/_rels/drawing1.xml.rels', buildDrawingRels());

    // ── 5. Ajouter la référence drawing dans la feuille worksheet ─────────────

    let sheetXml: string = await zip.file(sheetFile)!.async('text');
    const drawingRef = '<drawing r:id="rId_draw1"/>';
    if (!sheetXml.includes('<drawing ')) {
      sheetXml = sheetXml.replace('</worksheet>', `${drawingRef}</worksheet>`);
      zip.file(sheetFile, sheetXml);
    }

    // ── 6. Créer ou mettre à jour les relations de la feuille ─────────────────

    const drawingRelEntry =
      `<Relationship Id="rId_draw1" ` +
      `Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" ` +
      `Target="../drawings/drawing1.xml"/>`;

    const existingRels = zip.file(sheetRelsPath);
    if (existingRels) {
      let relsXml: string = await existingRels.async('text');
      if (!relsXml.includes('drawing1.xml')) {
        relsXml = relsXml.replace(
          '</Relationships>',
          `${drawingRelEntry}</Relationships>`,
        );
        zip.file(sheetRelsPath, relsXml);
      }
    } else {
      zip.file(
        sheetRelsPath,
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `${drawingRelEntry}</Relationships>`,
      );
    }

    // ── 7. Mettre à jour [Content_Types].xml ─────────────────────────────────

    let ctXml: string = await zip.file('[Content_Types].xml')!.async('text');
    const ctAdditions = [
      `<Override PartName="/xl/drawings/drawing1.xml" ` +
        `ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`,
      `<Override PartName="/xl/charts/chart1.xml" ` +
        `ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`,
      `<Override PartName="/xl/charts/chart2.xml" ` +
        `ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`,
      `<Override PartName="/xl/charts/chart3.xml" ` +
        `ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`,
    ].join('');

    if (!ctXml.includes('chart1.xml')) {
      ctXml = ctXml.replace('</Types>', `${ctAdditions}</Types>`);
      zip.file('[Content_Types].xml', ctXml);
    }

    // ── 8. Régénérer le buffer ────────────────────────────────────────────────

    const result: Buffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    return result;
  } catch (err) {
    // Les graphiques sont un bonus — jamais fatals pour le rapport
    console.warn(
      '[chart-injector] Injection échouée, buffer original retourné :',
      err,
    );
    return buffer;
  }
}
