export const TASK_DASHBOARD_CONFIG_BY_MODULE_ID = {
    litigation: {
        members: [
            {
                id: "MEOO",
                name: "Eduardo Olvera",
                aliases: ["MEOO", "EDUARDO OLVERA", "LITIGIO (LIDER)"]
            },
            {
                id: "LAMR",
                name: "Alejandra Mejia",
                aliases: ["LAMR", "ALEJANDRA MEJIA", "LITIGIO (COLABORADOR)"]
            },
            {
                id: "EKPO",
                name: "Evelyng Perez",
                aliases: ["EKPO", "EVELYNG PEREZ", "PROYECTISTA 1"]
            },
            {
                id: "NBSG",
                name: "Noelia Serrano",
                aliases: ["NBSG", "NOELIA SERRANO", "PROYECTISTA 2"]
            }
        ]
    },
    "corporate-labor": {
        members: [
            {
                id: "CRV",
                name: "Cristal Reyes",
                aliases: ["CRV", "CRISTAL REYES", "CORPORATIVO-LABORAL (LIDER)"]
            },
            {
                id: "CAGC",
                name: "Carlos Garcia",
                aliases: ["CAGC", "CARLOS GARCIA", "CORPORATIVO-LABORAL (COLABORADOR)", "PROYECTISTA CORPORATIVO-LABORAL"]
            }
        ],
        sharedResponsibleAliases: ["CRV/CAGC"]
    },
    settlements: {
        members: [
            {
                id: "MLDM",
                name: "Lorena Delgado",
                aliases: ["MLDM", "LORENA DELGADO", "CONVENIOS (LIDER)"]
            },
            {
                id: "CAOG",
                name: "Andrea Olguin",
                aliases: ["CAOG", "ANDREA OLGUIN", "CONVENIOS (COLABORADOR)"]
            }
        ],
        sharedResponsibleAliases: ["MLDM/CAOG"]
    },
    "financial-law": {
        members: [
            {
                id: "RJVO",
                name: "Rene Viruega",
                aliases: ["RJVO", "RV", "RENE VIRUEGA", "DER FINANCIERO (LIDER)"]
            },
            {
                id: "HKMG",
                name: "Hector Marquina",
                aliases: ["HKMG", "HM", "HECTOR MARQUINA", "DER FINANCIERO (COLABORADOR)"]
            }
        ],
        sharedResponsibleAliases: ["RJVO/HKMG", "RV/HM"]
    },
    "tax-compliance": {
        members: [
            {
                id: "MPC",
                name: "Martin Pantoja",
                aliases: ["MPC", "MP", "MARTIN PANTOJA", "COMPLIANCE FISCAL (LIDER)"]
            },
            {
                id: "YMAH",
                name: "Yoseline Alvarez",
                aliases: ["YMAH", "YA", "YOSELINE ALVAREZ", "COMPLIANCE FISCAL (COLABORADOR)"]
            }
        ],
        sharedResponsibleAliases: ["MPC/YMAH", "MP/YA"]
    }
};
