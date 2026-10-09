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

  const SEALS = Object.freeze({
    monarchy: Object.freeze({ label: "Monarchical Wax", path: "assets/seals/monarchy.png", scale: 1 }),
    republic: Object.freeze({ label: "Republican Seal", path: "assets/seals/republic.png", scale: 1 }),
    tribal: Object.freeze({ label: "Tribal Mark", path: "assets/seals/tribal.png", scale: 1 }),
    runic: Object.freeze({ label: "Dwarven Runes", path: "assets/seals/runic.png", scale: 1 }),
    lotus: Object.freeze({ label: "Lotus Seal", path: "assets/seals/lotus.png", scale: 1 }),
    bulwar: Object.freeze({ label: "Bulwari Seal", path: "assets/seals/bulwar.png", scale: 1 }),
    magocracy: Object.freeze({ label: "Magocratic Sigil", path: "assets/seals/magocracy.png", scale: 1 })
  });

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
    counts_league: country("counts_league", "Counts League", "counts_league.png", { defaultRulerTitle: "Count of the League" }),
    marhold: country("marhold", "Marhold", "marhold.png", { accent: "#8b6924", defaultRulerTitle: "Lord of Marhold" }),
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
    assets: Object.freeze({ seal: "assets/seals/monarchy.png" }),
    seals: SEALS,
    surfaces: SURFACES,
    countries: COUNTRIES,
    defaultState: Object.freeze({
      version: 4,
      country: "counts_league",
      surface: "parchment",
      header: "Formal Correspondence",
      recipient: "To the Lord of Marhold,",
      body: "Word has reached our court of recent developments along the frontier.\n\nIt is our hope that the interests of our realms may yet be settled through cordial negotiation rather than needless dispute. We therefore invite your representatives to meet with ours and establish terms acceptable to both parties.",
      closing: "By my hand,",
      signatory: "Aldren III",
      title: "Count of the League",
      date: Object.freeze({ day: 11, month: 10, year: 1444 }),
      sealStyle: "monarchy",
      showDate: false,
      showCrest: true,
      showSeal: true,
      customCrest: null,
      customCrestName: ""
    })
  });
})();
