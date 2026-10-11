(function () {
  "use strict";

  const FORMATS = Object.freeze({
    letter: Object.freeze({
      label: "Diplomatic Letter",
      senderLabel: "Country / Sender",
      titleLabel: "Header",
      bodyLabel: "Body",
      showRecipient: true,
      showSubtitle: false,
      showParties: false,
      showPreamble: false,
      showDeadline: false,
      showClosing: true,
      treatySignatures: false,
      defaultShowCrest: true,
      defaultShowSeal: true,
      defaultShowDate: true,
      firstBodyTop: 510,
      continuationBodyTop: 190,
      visual: Object.freeze({
        identity: "letter", crestScale: 1, crestSize: 238, crestY: 62, dividerWithCrest: 318, dividerWithoutCrest: 146,
        titleGap: 56, metaGap: 72, headerScale: 1, divider: "ornament",
        authentication: "personal", authenticationLabel: "", sealScale: 1
      })
    }),
    decree: Object.freeze({
      label: "Decree / Proclamation",
      senderLabel: "Issuing Country / Authority",
      titleLabel: "Document title",
      bodyLabel: "Body",
      showRecipient: false,
      showSubtitle: true,
      showParties: false,
      showPreamble: false,
      showDeadline: false,
      showClosing: false,
      treatySignatures: false,
      defaultShowCrest: true,
      defaultShowSeal: true,
      defaultShowDate: true,
      firstBodyTop: 470,
      continuationBodyTop: 190,
      prominentTitle: true,
      visual: Object.freeze({
        identity: "decree", crestScale: 1.16, crestSize: 238, crestY: 48, dividerWithCrest: 330, dividerWithoutCrest: 134,
        titleGap: 134, metaGap: 54, headerScale: 1.08, divider: "double",
        authorityLabel: "BY ORDER OF", authentication: "institutional",
        authenticationLabel: "ISSUED AND SEALED", sealScale: 1.08
      })
    }),
    treaty: Object.freeze({
      label: "Treaty / Agreement",
      senderLabel: "Primary country / authority",
      titleLabel: "Treaty title",
      bodyLabel: "Terms / Articles",
      showRecipient: false,
      showSubtitle: false,
      showParties: true,
      showPreamble: true,
      showDeadline: false,
      showClosing: false,
      treatySignatures: true,
      defaultShowCrest: false,
      defaultShowSeal: true,
      defaultShowDate: true,
      firstBodyTop: 570,
      continuationBodyTop: 190,
      prominentTitle: true,
      visual: Object.freeze({
        identity: "treaty", crestScale: .82, crestSize: 238, crestY: 54, dividerWithCrest: 292, dividerWithoutCrest: 146,
        titleGap: 56, metaGap: 72, headerScale: 1, divider: "ornament",
        authentication: "bilateral", authenticationLabel: "SIGNED AND SEALED", sealScale: .92
      })
    }),
    ultimatum: Object.freeze({
      label: "Ultimatum",
      senderLabel: "Sender",
      titleLabel: "Title",
      bodyLabel: "Body / Demands",
      showRecipient: true,
      showSubtitle: false,
      showParties: false,
      showPreamble: false,
      showDeadline: true,
      showClosing: false,
      treatySignatures: false,
      defaultShowCrest: true,
      defaultShowSeal: true,
      defaultShowDate: true,
      firstBodyTop: 500,
      continuationBodyTop: 190,
      prominentTitle: true,
      visual: Object.freeze({
        identity: "ultimatum", crestScale: .9, crestSize: 238, crestY: 54, dividerWithCrest: 292, dividerWithoutCrest: 138,
        titleGap: 54, metaGap: 62, headerScale: 1.08, divider: "heavy",
        authentication: "institutional", authenticationLabel: "ISSUED BY", sealScale: 1.02,
        deadlineBlock: true
      })
    }),
    contract: Object.freeze({
      label: "Contract / Charter",
      senderLabel: "Issuing country / authority",
      titleLabel: "Title",
      bodyLabel: "Body / Terms",
      showRecipient: false,
      showSubtitle: false,
      showParties: true,
      showPreamble: true,
      showDeadline: false,
      showClosing: false,
      treatySignatures: false,
      defaultShowCrest: true,
      defaultShowSeal: true,
      defaultShowDate: true,
      firstBodyTop: 500,
      continuationBodyTop: 190,
      prominentTitle: true,
      visual: Object.freeze({
        identity: "contract", crestScale: .74, crestSize: 238, crestY: 52, dividerWithCrest: 260, dividerWithoutCrest: 138,
        titleGap: 54, metaGap: 62, headerScale: 1, divider: "double",
        authentication: "legal", authenticationLabel: "SIGNED / GRANTED BY", sealScale: .92
      })
    })
  });

  const TEMPLATES = Object.freeze({
    letter: Object.freeze({
      formal: { label: "Formal Correspondence", header: "Formal Correspondence", closing: "By my hand," },
      alliance: { label: "Alliance Proposal", header: "Proposal of Alliance", closing: "In friendship and good faith," },
      trade: { label: "Trade Proposal", header: "Proposal of Trade", closing: "In mutual prosperity," },
      invitation: { label: "Invitation", header: "Formal Invitation", closing: "With highest regard," },
      condolence: { label: "Condolence", header: "Message of Condolence", closing: "With solemn respect," },
      warning: { label: "Warning", header: "Formal Warning", closing: "Take due heed," }
    }),
    decree: Object.freeze({
      royal: { label: "Royal Decree", header: "Royal Decree", subtitle: "Let it be known throughout the realm" },
      proclamation: { label: "Public Proclamation", header: "Public Proclamation", subtitle: "By authority of the issuing power" },
      appointment: { label: "Appointment", header: "Decree of Appointment", subtitle: "Concerning office and duty" },
      resettlement: { label: "Resettlement Edict", header: "Edict of Resettlement", subtitle: "Concerning lands and settlement" }
    }),
    treaty: Object.freeze({
      defence: { label: "Mutual Defence Pact", header: "Mutual Defence Pact", preamble: "The named parties, seeking mutual security, agree to the following terms." },
      nonaggression: { label: "Non-Aggression Pact", header: "Non-Aggression Pact", preamble: "The named parties enter this pact in good faith and mutual restraint." },
      trade: { label: "Trade Agreement", header: "Trade Agreement", preamble: "The named parties establish these terms of lawful exchange." },
      peace: { label: "Peace Settlement", header: "Peace Settlement", preamble: "The named parties resolve their present dispute under the following terms." }
    }),
    ultimatum: Object.freeze({
      final: { label: "Final Demand", header: "Final Demand" },
      territorial: { label: "Territorial Demand", header: "Territorial Demand" },
      surrender: { label: "Surrender Demand", header: "Demand for Surrender" }
    }),
    contract: Object.freeze({
      land: { label: "Land Grant", header: "Land Grant" },
      trade: { label: "Trade Contract", header: "Mercantile Contract" },
      founding: { label: "Founding Charter", header: "Founding Charter" }
    })
  });

  window.AnbennarFormats = Object.freeze({ FORMATS, TEMPLATES });
})();
