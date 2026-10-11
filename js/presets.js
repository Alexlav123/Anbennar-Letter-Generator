(function () {
  "use strict";

  function surface(label, path, options = {}) {
    return Object.freeze({
      label,
      path,
      inkColor: "#2d2117",
      secondaryInkColor: "#5c3e21",
      headerColor: "#332318",
      bodyFont: "EB Garamond Local",
      headerFont: "Cinzel Local",
      signatureFont: "EB Garamond Local",
      bodyWeight: 400,
      headerWeight: 600,
      signatureWeight: 600,
      letterSpacing: 3,
      crestScale: 1,
      crestTreatment: "original",
      crestTint: null,
      sealScale: 1,
      contentOffsetY: 0,
      ...options
    });
  }

  const SURFACES = Object.freeze({
    parchment: surface("Parchment", "assets/surfaces/parchment.png"),
    paper_ivory: surface("Ivory Paper", "assets/surfaces/paper_ivory.png", {
      inkColor: "#29221b", headerColor: "#2e241a", bodyFont: "EB Garamond Local", headerFont: "EB Garamond Local", signatureFont: "EB Garamond Local"
    }),
    leather: surface("Leather", "assets/surfaces/leather.png", {
      inkColor: "#28190f", secondaryInkColor: "#533018", headerColor: "#2b190d", bodyFont: "Alegreya Local", headerFont: "Alegreya Local", signatureFont: "Alegreya Local"
    }),
    silk: surface("Silk", "assets/surfaces/silk.png", {
      inkColor: "#30251a", headerColor: "#38291b", bodyFont: "Cormorant Garamond Local", headerFont: "Cormorant Garamond Local", signatureFont: "Cormorant Garamond Local"
    }),
    steel: surface("Steel", "assets/surfaces/steel.png", {
      inkColor: "#211d19", secondaryInkColor: "#42362c", headerColor: "#181512", bodyFont: "EB Garamond Local", headerFont: "Cinzel Local", signatureFont: "EB Garamond Local", contentOffsetY: 48,
      crestTreatment: "engraved", crestTint: "#44484d"
    }),
    stone: surface("Stone", "assets/surfaces/stone.png", {
      inkColor: "#29241f", secondaryInkColor: "#4a4036", headerColor: "#201c18", bodyFont: "EB Garamond Local", headerFont: "Cinzel Local", signatureFont: "EB Garamond Local", contentOffsetY: 48,
      crestTreatment: "engraved", crestTint: "#7a766f"
    }),
    wood: surface("Wood", "assets/surfaces/wood.png", {
      inkColor: "#2a1b10", secondaryInkColor: "#57351a", headerColor: "#2d1a0d", bodyFont: "Alegreya Local", headerFont: "Alegreya Local", signatureFont: "Alegreya Local"
    })
  });

  function sealCategory(label, designCount, options = {}) {
    return Object.freeze({
      label,
      designs: Object.freeze(Array.from({ length: designCount }, (_, index) => String(index + 1))),
      scale: 1,
      ...options
    });
  }

  const SEAL_CATEGORIES = Object.freeze({
    bulwari: sealCategory("Bulwari", 3),
    magocracy: sealCategory("Magocracy", 3),
    monarchy: sealCategory("Monarchy", 3),
    republic: sealCategory("Republic", 4),
    runic: sealCategory("Runic", 3),
    sarhal: sealCategory("Sarhal", 3),
    tribal: sealCategory("Tribal", 3),
    custom: Object.freeze({ label: "Custom", dynamic: true, scale: 1 })
  });

  function resolveSeal(category, design) {
    const definition = SEAL_CATEGORIES[category];
    if (!definition || definition.dynamic) return null;
    const resolvedDesign = definition.designs.includes(String(design)) ? String(design) : definition.designs[0];
    return Object.freeze({
      category,
      design: resolvedDesign,
      label: `${definition.label} · Design ${resolvedDesign}`,
      path: `assets/seals/${category}/${resolvedDesign}.png`,
      scale: definition.scale || 1
    });
  }

  function country(id, label, filename, options = {}) {
    return Object.freeze({
      id,
      label,
      crest: filename ? `assets/crests/${filename.replace(/\.(png|jpe?g|webp)$/i, "")}.png` : null,
      defaultSurface: "parchment",
      defaultSeal: null,
      seal: "assets/seals/seal_1.png",
      accent: "#74552b",
      headingFont: "Cinzel Local",
      bodyFont: "EB Garamond Local",
      defaultRulerTitle: "Sovereign",
      ...options
    });
  }

  const COUNTRIES = Object.freeze({
    counts_league: country("counts_league", "Counts League", "counts_league.png", { aliases: ["Count's League", "Counts' League", "Castellyr"], defaultRulerTitle: "Count of the League" }),
    marhold: country("marhold", "Marhold", "marhold.png", { aliases: ["Marrhold"], accent: "#8b6924", defaultRulerTitle: "Lord of Marhold" }),
    adshaw: country("adshaw", "Adshaw", "adshaw.png"),
    asarta: country("asarta", "Asarta", "asarta.png"),
    asra_expedition: country("asra_expedition", "Asra Expedition", "asra_expedition.png"),
    ayarallen: country("ayarallen", "Ayarallen", "ayarallen.png"),
    beepeck: country("beepeck", "Beepeck", "beepeck.png"),
    bibyobi: country("bibyobi", "Bibyobi", "bibyobi.png"),
    birsartanses: country("birsartanses", "Birsartanses", "birsartanses.png"),
    blackbeard_cartel: country("blackbeard_cartel", "Blackbeard Cartel", "blackbeard_cartel.png"),
    bonecarver: country("bonecarver", "Bonecarver", "bonecarver.png"),
    brrtekuh: country("brrtekuh", "Brrtekuh", "brrtekuh.png"),
    clan_silvertusk: country("clan_silvertusk", "Clan Silvertusk", "clan_silvertusk.png"),
    company_of_duran_blueshield: country("company_of_duran_blueshield", "Company of Duran Blueshield", "company_of_duran_blueshield.png"),
    corvuria: country("corvuria", "Corvuria", "corvuria.png"),
    damescrown: country("damescrown", "Damescrown", "damescrown.png"),
    duwarkani: country("duwarkani", "Duwarkani", "duwarkani.png"),
    giberd: country("giberd", "Giberd", "giberd.png"),
    hisost_yamok: country("hisost_yamok", "Hisost Yamok", "hisost_yamok.png"),
    ibevar: country("ibevar", "Ibevar", "ibevar.png"),
    iron_sceptre: country("iron_sceptre", "Iron Sceptre", "Iron_sceptre.png"),
    luciande: country("luciande", "Luciande", "luciande.png"),
    masked_butcher: country("masked_butcher", "Masked Butcher", "masked_butcher.png"),
    nathalaire: country("nathalaire", "Nathalaire", "nathalaire.png"),
    ourdia: country("ourdia", "Ourdia", "ourdia.png"),
    redglades: country("redglades", "Redglades", "redglades.png"),
    redscale: country("redscale", "Redscale", "redscale.png"),
    ruby_company: country("ruby_company", "Ruby Company", "ruby_company.png"),
    shelokmengi: country("shelokmengi", "Shelokmengi", "shelokmengi.png"),
    silvelar: country("silvelar", "Silvelar", "silvelar.png"),
    tellum: country("tellum", "Tellum", "tellum.png"),
    tluukt: country("tluukt", "Tluukt", "tluukt.png"),
    vaelheim: country("vaelheim", "Vaelheim", "vaelheim.png"),
    varivar: country("varivar", "Varivar", "varivar.png"),
    verkal_gulan: country("verkal_gulan", "Verkal Gulan", "verkal_gulan.png"),
    wineport: country("wineport", "Wineport", "wineport.png"),
    woodwell: country("woodwell", "Woodwell", "woodwell.png"),
    xanzerbexis: country("xanzerbexis", "Xanzerbexis", "xanzerbexis.png"),
    zulbur: country("zulbur", "Zulbur", "zulbur.png"),
    custom: country("custom", "Custom Nation", null)
  });

  window.AnbennarConfig = Object.freeze({
    assets: Object.freeze({ seal: "assets/seals/monarchy/1.png" }),
    sealCategories: SEAL_CATEGORIES,
    resolveSeal,
    surfaces: SURFACES,
    countries: COUNTRIES,
    defaultState: Object.freeze({
      version: 8,
      format: "letter",
      template: "",
      country: "counts_league",
      surface: "parchment",
      issuingAuthority: "",
      header: "Formal Correspondence",
      subtitle: "",
      recipient: "To the Lord of Marhold,",
      parties: "",
      preamble: "",
      body: "Word has reached our court of recent developments along the frontier.\n\nIt is our hope that the interests of our realms may yet be settled through cordial negotiation rather than needless dispute. We therefore invite your representatives to meet with ours and establish terms acceptable to both parties.",
      deadline: "",
      closing: "By my hand,",
      signatory: "Aldren III",
      title: "Count of the League",
      partyA: "Count's League",
      representativeA: "Aldren III",
      representativeTitleA: "Count of the League",
      partyB: "",
      representativeB: "",
      representativeTitleB: "",
      date: Object.freeze({ day: 11, month: 10, year: 1444 }),
      sealCategory: "monarchy",
      sealDesign: "1",
      sealCategoryA: "monarchy",
      sealDesignA: "1",
      sealCategoryB: "",
      sealDesignB: "1",
      showDate: true,
      showCrest: true,
      showSeal: true,
      showPageNumbers: true,
      customCrest: null,
      customCrestName: "",
      positioning: Object.freeze({ crestScale: 1, crestX: 0, crestY: 0, sealScale: 1, sealX: 0, sealY: 0 }),
      currentPage: 0,
      libraryId: null
    })
  });
})();
