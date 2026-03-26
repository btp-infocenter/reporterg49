sap.ui.define([
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/m/BusyDialog",
    "sap/m/Dialog",
    "sap/m/RadioButtonGroup",
    "sap/m/RadioButton",
    "sap/m/Button",
    "sap/m/VBox",
    "sap/m/Label",
    "sap/m/CheckBox",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], function (MessageToast, MessageBox, BusyDialog, Dialog, RadioButtonGroup, RadioButton, Button, VBox, Label, CheckBox, Filter, FilterOperator) {
    'use strict';

    var PDFMAKE_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/pdfmake.min.js";
    var PDFMAKE_FONTS_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/vfs_fonts.js";

    var fmt = function (v) {
        if (v === null || v === undefined || isNaN(v)) return "0";
        return Number(v).toLocaleString('es-PY', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    };

    var _parseImporteDisplay = function (sDisplay) {
        if (!sDisplay) return 0;
        var s = sDisplay.toString().trim();
        // Quitar sufijo de moneda (PYG, USD, etc.)
        s = s.replace(/\s*[A-Z]{3}\s*$/i, "").trim();
        // Detectar negativo entre paréntesis
        var bNeg = false;
        if (s.charAt(0) === '(' && s.charAt(s.length - 1) === ')') {
            bNeg = true;
            s = s.substring(1, s.length - 1).trim();
        } else if (s.charAt(0) === '-') {
            bNeg = true;
            s = s.substring(1).trim();
        }
        // Quitar separadores de miles (puntos en es-PY)
        s = s.replace(/\./g, "");
        // Reemplazar coma decimal por punto
        s = s.replace(/,/g, ".");
        var f = parseFloat(s) || 0;
        return bNeg ? -f : f;
    };

    var fmtFlujo = function (v) {
        if (v === null || v === undefined || isNaN(v) || v === 0) return "-";
        var num = Number(v);
        if (num < 0) {
            return "(" + Math.abs(num).toLocaleString('es-PY', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ")";
        }
        return num.toLocaleString('es-PY', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    };

    var _periodoAFecha = function (sPeriodo, sEjercicio, bUltimoDia) {
        var iPeriodo = parseInt(sPeriodo, 10) || 1;
        if (iPeriodo < 1) iPeriodo = 1;
        if (iPeriodo > 12) iPeriodo = 12;
        var sMes = iPeriodo < 10 ? "0" + iPeriodo : "" + iPeriodo;
        if (bUltimoDia) {
            var iUltimoDia = new Date(parseInt(sEjercicio, 10), iPeriodo, 0).getDate();
            return (iUltimoDia < 10 ? "0" + iUltimoDia : "" + iUltimoDia) + "/" + sMes + "/" + sEjercicio;
        }
        return "01/" + sMes + "/" + sEjercicio;
    };

    var _parseCuentaSegmentos = function (sRaw) {
        if (!sRaw) return [];
        var s = sRaw.toString();
        if (s.length <= 1) return [parseInt(s, 10)];
        var parts = [], rest;
        if (s.length % 2 === 0) { parts.push(parseInt(s.substring(0, 2), 10)); rest = s.substring(2); }
        else { parts.push(parseInt(s.charAt(0), 10)); rest = s.substring(1); }
        while (rest.length > 0) { parts.push(parseInt(rest.substring(0, 2), 10)); rest = rest.substring(2); }
        return parts;
    };

    var _compararCuentasJerarquico = function (sRawA, sRawB) {
        var partsA = _parseCuentaSegmentos(sRawA);
        var partsB = _parseCuentaSegmentos(sRawB);
        var len = Math.max(partsA.length, partsB.length);
        for (var i = 0; i < len; i++) {
            var nA = i < partsA.length ? partsA[i] : -1;
            var nB = i < partsB.length ? partsB[i] : -1;
            if (nA !== nB) return nA - nB;
        }
        return 0;
    };

    var oBusyDialog = new BusyDialog({
        title: "Por favor espere",
        text: "Generando PDF..."
    });

    var ANEXOS_CONFIG = {
        "1": { titulo: "ANEXO 1", subtitulo: "BALANCE GENERAL", cuentasDesde: 1, cuentasHasta: 3, nombreArchivo: "Balance_General", tipo: "balance" },
        "2": { titulo: "ANEXO Nº 2", subtitulo: "ESTADO DE RESULTADOS", cuentasDesde: 4, cuentasHasta: 20, nombreArchivo: "Estado_Resultados", tipo: "resultados" },
        "3": { titulo: "ANEXO N° 3", subtitulo: "ESTADO DE FLUJO DE EFECTIVO", cuentasDesde: 8000, cuentasHasta: 8022, nombreArchivo: "Flujo_Efectivo", tipo: "flujo" },
        "4": { titulo: "ANEXO N° 4", subtitulo: "ESTADO DE CAMBIOS DEL PATRIMONIO NETO", cuentasDesde: 3, cuentasHasta: 3, nombreArchivo: "Estado_Cambios_Patrimonio", tipo: "patrimonio" }
    };

    var ESTADO_RESULTADOS_SEPARADORES = {
        "5": "MENOS:",
        "8": "MÁS:",
        "10": "MENOS:",
        "11": "MENOS:",
        "13": "MENOS:",
        "15": "MENOS:"
    };

    var CUENTAS_TOTALES_CALCULADOS = {
        "6": true, "9": true, "12": true, "16": true, "18": true, "20": true
    };

    // Cuentas calculadas del Estado de Resultados (Anexo 2)
    // Orden importa: cada cuenta puede depender de una calculada previamente
    var CUENTAS_CALCULADAS_RESULTADOS = [
        { cuenta: "6",  descripcion: "GANANCIAS (O PÉRDIDAS) BRUTAS EN VENTAS",                operandos: [["4", 1], ["5", -1]] },
        { cuenta: "9",  descripcion: "GANANCIAS (O PÉRDIDAS) BRUTAS TOTALES",                  operandos: [["6", 1], ["8", 1]] },
        { cuenta: "12", descripcion: "GANANCIAS (O PÉRDIDAS) ANTES DE GASTOS FINANCIEROS",     operandos: [["9", 1], ["10", -1], ["11", -1]] },
        { cuenta: "16", descripcion: "GANANCIAS (O PÉRDIDAS) OPERATIVAS",                      operandos: [["12", 1], ["13", -1], ["15", -1]] },
        { cuenta: "18", descripcion: "GANANCIAS (O PÉRDIDAS) ANTES DEL IMPUESTO A LA RENTA",   operandos: [["16", 1], ["17", 1]] },
        { cuenta: "20", descripcion: "GANANCIAS/PÉRDIDAS NETAS DEL EJERCICIO",                 operandos: [["18", 1], ["19", 1]] }
    ];

    // ============================================================
    // CONFIGURACIÓN DEL ANEXO 4 - ESTADO DE CAMBIOS DEL PATRIMONIO
    // ============================================================
    var PATRIMONIO_COLUMNAS_MAPEO = {
        "301": 0, "30101": 0, "302": 1, "30201": 1, "30202": 2,
        "30203": 3, "303": 4, "30301": 4, "30302": 5, "304": 5
    };

    // ============================================================
    // Extracción de parámetros del binding path del OData V4
    // ============================================================
    function _extractParams(sPath) {
        var oParams = {};
        var match = sPath.match(/RG49Report\(([^)]+)\)/);
        if (match) {
            match[1].split(",").forEach(function (sPair) {
                var parts = sPair.split("=");
                if (parts.length === 2) {
                    oParams[parts[0].trim()] = parts[1].replace(/'/g, "").trim();
                }
            });
        }
        return oParams;
    }

    // ============================================================
    // PdfExport - Handler para acción personalizada FE V4
    // ============================================================
    var PdfExport = {
        _pdfMakeLoaded: false,
        _oView: null,
        _oModel: null,
        _oFilterData: null,
        _sBindingPath: "",
        _bHideAnterior: false,

        exportarPdf: function (oBindingContext, aSelectedContexts) {
            try {
                // Obtener vista desde ExtensionAPI (this) de FE V4
                var oView;
                if (this.getView) {
                    oView = this.getView();
                } else if (this._controller) {
                    oView = this._controller.getView();
                } else if (this._view) {
                    oView = this._view;
                }
                if (!oView) {
                    MessageBox.error("Vista no encontrada.");
                    return;
                }

                var oModel = oView.getModel();

                // Buscar MDC Table o TreeTable
                var oTable = null;
                oView.findAggregatedObjects(true, function (oElem) {
                    if (oElem.isA && (oElem.isA("sap.ui.mdc.Table") || oElem.isA("sap.ui.table.TreeTable"))) {
                        if (!oTable) { oTable = oElem; }
                    }
                });

                if (!oTable) {
                    MessageBox.error("Tabla no encontrada.");
                    return;
                }

                var oRowBinding = oTable.getRowBinding ? oTable.getRowBinding() : oTable.getBinding("rows");
                if (!oRowBinding) {
                    MessageBox.warning("No hay datos cargados. Presione 'Ir' primero.");
                    return;
                }

                // Extraer parámetros del binding path resuelto
                var sBindingPath = "";
                var oHeaderCtx = oRowBinding.getHeaderContext ? oRowBinding.getHeaderContext() : null;
                if (oHeaderCtx) {
                    sBindingPath = oHeaderCtx.getPath();
                } else {
                    var oCtx = oRowBinding.getContext ? oRowBinding.getContext() : null;
                    sBindingPath = oCtx ? (oCtx.getPath() + "/" + oRowBinding.getPath()) : oRowBinding.getPath();
                }

                var oParams = _extractParams(sBindingPath);
                // Fallback: tabla puede estar bindeada a JSONModel local (/nodes)
                if ((!oParams.P_CompanyCode || !oParams.P_FiscalYear) && window.__rg49ODataBindingPath) {
                    sBindingPath = window.__rg49ODataBindingPath;
                    oParams = _extractParams(sBindingPath);
                }
                if (!oParams.P_CompanyCode || !oParams.P_FiscalYear) {
                    MessageBox.warning("Seleccione Sociedad y Ejercicio Fiscal y presione 'Ir'.");
                    return;
                }

                PdfExport._oView = oView;
                PdfExport._oModel = oModel;
                PdfExport._sBindingPath = sBindingPath;
                PdfExport._oFilterData = {
                    sociedad: oParams.P_CompanyCode,
                    ejercicio: oParams.P_FiscalYear,
                    ejercicioAnterior: oParams.P_FiscalYearPrev || (parseInt(oParams.P_FiscalYear) - 1).toString(),
                    periodoDesde: oParams.P_PeriodFrom,
                    periodoHasta: oParams.P_PeriodTo
                };

                PdfExport._mostrarDialogoSeleccion();
            } catch (error) {
                console.error(error);
                MessageBox.error(error.message);
            }
        },

        _mostrarDialogoSeleccion: function () {
            var oRadioGroup = new RadioButtonGroup({
                columns: 1, selectedIndex: 0,
                buttons: [
                    new RadioButton({ text: "Anexo 1 - Balance General" }),
                    new RadioButton({ text: "Anexo 2 - Estado de Resultados" }),
                    new RadioButton({ text: "Anexo 3 - Estado de Flujo de Efectivo" }),
                    new RadioButton({ text: "Anexo 4 - Estado de Cambios del Patrimonio Neto" })
                ]
            });

            var oCheckHideAnterior = new CheckBox({
                text: "Ocultar Año Comparativo",
                selected: false
            });

            var oDialog = new Dialog({
                title: "Reporte RG49",
                content: new VBox({
                    items: [
                        new Label({ text: "Seleccione reporte:", design: "Bold" }).addStyleClass("sapUiSmallMarginBottom"),
                        oRadioGroup,
                        oCheckHideAnterior.addStyleClass("sapUiSmallMarginTop")
                    ]
                }).addStyleClass("sapUiSmallMargin"),
                beginButton: new Button({
                    text: "Generar PDF", type: "Emphasized",
                    press: function () {
                        var sAnexo = (oRadioGroup.getSelectedIndex() + 1).toString();
                        PdfExport._bHideAnterior = oCheckHideAnterior.getSelected();
                        oDialog.close();
                        PdfExport._generarPDFConAnexo(sAnexo);
                    }
                }),
                endButton: new Button({ text: "Cancelar", press: function () { oDialog.close(); } }),
                afterClose: function () { oDialog.destroy(); }
            });
            oDialog.open();
        },

        // ============================================================
        // Lectura de datos desde OData V4
        // ============================================================
        _readAllData: function () {
            var oModel = PdfExport._oModel;
            var sPath = PdfExport._sBindingPath;

            // Prioridad 1: Leer del JSONModel tree (tiene TODA la data incluyendo nodo FLUJO)
            return PdfExport._readFromTableBinding().then(function (aData) {
                if (aData && aData.length > 0) {
                    return aData;
                }
                // Prioridad 2: Flat OData binding como fallback
                return new Promise(function (resolve) {
                    var oListBinding = oModel.bindList(sPath);
                    oListBinding.requestContexts(0, 10000).then(function (aContexts) {
                        var aResult = aContexts.map(function (oCtx) { return oCtx.getObject(); });
                        oListBinding.destroy();
                        resolve(aResult);
                    }).catch(function () {
                        oListBinding.destroy();
                        resolve([]);
                    });
                });
            });
        },

        _readFromTableBinding: function () {
            return new Promise(function (resolve) {
                var oView = PdfExport._oView;
                var oTreeTable = null;
                var oMdcTable = null;
                oView.findAggregatedObjects(true, function (e) {
                    if (e.isA && e.isA("sap.ui.table.TreeTable") && !oTreeTable) {
                        oTreeTable = e;
                    }
                    if (e.isA && e.isA("sap.ui.mdc.Table") && !oMdcTable) {
                        oMdcTable = e;
                    }
                });

                // Check if TreeTable is bound to a local JSONModel (from ListReportExt._loadAndBindLocal)
                if (oTreeTable) {
                    var oModel = oTreeTable.getModel();
                    var bIsJSONModel = oModel && oModel.isA && oModel.isA("sap.ui.model.json.JSONModel");
                    if (bIsJSONModel) {
                        var oData = oModel.getData();
                        if (oData && oData.nodes && oData.nodes.length > 0) {
                            var aFlat = [];
                            var fnFlatten = function (aNodes) {
                                aNodes.forEach(function (oNode) {
                                    var oCopy = Object.assign({}, oNode);
                                    delete oCopy.children;
                                    aFlat.push(oCopy);
                                    if (oNode.children && oNode.children.length > 0) {
                                        fnFlatten(oNode.children);
                                    }
                                });
                            };
                            fnFlatten(oData.nodes);
                            resolve(aFlat);
                            return;
                        }
                    }
                }

                // Fallback: read from binding contexts
                var oTable = oTreeTable || oMdcTable;
                var oRowBinding = oTable && (oTable.getRowBinding ? oTable.getRowBinding() : oTable.getBinding("rows"));
                if (oRowBinding && oRowBinding.getAllCurrentContexts) {
                    var aContexts = oRowBinding.getAllCurrentContexts();
                    resolve(aContexts.map(function (oCtx) { return oCtx.getObject(); }));
                } else {
                    resolve([]);
                }
            });
        },

        // ============================================================
        // Generación del PDF
        // ============================================================
        _generarPDFConAnexo: async function (sAnexo) {
            oBusyDialog.open();
            try {
                var aTableData = await PdfExport._readAllData();
                if (!aTableData || aTableData.length === 0) { oBusyDialog.close(); MessageBox.warning("Sin datos."); return; }

                var oAnexoConfig = ANEXOS_CONFIG[sAnexo];
                var aDataProcesada;

                if (oAnexoConfig.tipo === "patrimonio") {
                    aDataProcesada = PdfExport._procesarDatosParaPatrimonio(aTableData);
                } else if (oAnexoConfig.tipo === "flujo") {
                    aDataProcesada = PdfExport._procesarDatosParaFlujoEfectivo(aTableData);
                } else {
                    aDataProcesada = PdfExport._procesarDatosParaAnexo(aTableData, oAnexoConfig);
                    if (oAnexoConfig.tipo === "resultados") {
                        aDataProcesada = PdfExport._calcularCuentasResultados(aDataProcesada);
                    }
                }

                if (aDataProcesada.length === 0) { oBusyDialog.close(); MessageBox.warning("Sin datos para este Anexo."); return; }

                await PdfExport._loadPdfMake();
                if (window.pdfMake && window.pdfFonts && window.pdfFonts.pdfMake) {
                    window.pdfMake.vfs = window.pdfFonts.pdfMake.vfs;
                }

                var oHeaderData = await PdfExport._readSociedadData();
                var docDefinition;

                if (oAnexoConfig.tipo === "patrimonio") {
                    docDefinition = PdfExport._crearDefinicionPDFPatrimonio(oHeaderData, aDataProcesada, PdfExport._oFilterData, oAnexoConfig);
                } else if (oAnexoConfig.tipo === "flujo") {
                    docDefinition = PdfExport._crearDefinicionPDFFlujoEfectivo(oHeaderData, aDataProcesada, PdfExport._oFilterData, oAnexoConfig);
                } else {
                    docDefinition = PdfExport._crearDefinicionPDF(oHeaderData, aDataProcesada, PdfExport._oFilterData, oAnexoConfig);
                }

                var sFileName = oAnexoConfig.nombreArchivo + "_" + PdfExport._oFilterData.sociedad + ".pdf";

                var pdfDoc = pdfMake.createPdf(docDefinition);
                pdfDoc.getBlob(function (blob) {
                    var sUrl = URL.createObjectURL(blob);
                    var sContainerId = "pdfContainer_" + Date.now();

                    var oHtmlContent = new sap.ui.core.HTML({
                        content: '<div id="' + sContainerId + '" style="width:100%;height:100%;position:absolute;top:0;left:0;right:0;bottom:0;">' +
                            '<iframe src="' + sUrl + '#toolbar=1&navpanes=1" style="width:100%;height:100%;border:none;display:block;" type="application/pdf" title="Vista previa PDF"></iframe></div>',
                        preferDOM: true
                    });

                    var oPreviewDialog = new Dialog({
                        title: oAnexoConfig.titulo + " - " + oAnexoConfig.subtitulo,
                        contentWidth: "90%", contentHeight: "85%",
                        stretch: sap.ui.Device.system.phone,
                        resizable: true, draggable: true,
                        verticalScrolling: false, horizontalScrolling: false,
                        content: [oHtmlContent],
                        buttons: [
                            new Button({
                                text: "Descargar", type: "Emphasized", icon: "sap-icon://download",
                                press: function () {
                                    var link = document.createElement('a');
                                    link.href = sUrl; link.download = sFileName;
                                    document.body.appendChild(link); link.click(); document.body.removeChild(link);
                                    MessageToast.show("Descargando " + sFileName);
                                }
                            }),
                            new Button({ text: "Cerrar", press: function () { oPreviewDialog.close(); } })
                        ],
                        afterClose: function () {
                            URL.revokeObjectURL(sUrl);
                            oHtmlContent.destroy();
                            oPreviewDialog.destroy();
                        }
                    });
                    oPreviewDialog.addStyleClass("sapUiNoContentPadding");
                    oPreviewDialog.open();
                    oBusyDialog.close();
                    MessageToast.show("PDF generado.");
                });
            } catch (error) {
                console.error(error);
                MessageBox.error(error.message);
                oBusyDialog.close();
            }
        },

        // ============================================================
        // Procesamiento de datos
        // ============================================================
        _procesarDatosParaAnexo: function (aData, oAnexoConfig) {
            var oMap = {};

            aData.forEach(function (oRow) {
                var sCuenta = (oRow.Rg49Account || "").toString();
                if (!sCuenta || sCuenta === "0") return;

                var iCuentaPrincipal = PdfExport._obtenerCuentaPrincipal(sCuenta);

                if (iCuentaPrincipal >= oAnexoConfig.cuentasDesde && iCuentaPrincipal <= oAnexoConfig.cuentasHasta) {
                    // Solo tomar la primera ocurrencia (jerarquía principal, antes que FLUJO)
                    if (!oMap[sCuenta]) {
                        oMap[sCuenta] = {
                            Rg49Account: oRow.Rg49Account,
                            Description: oRow.Description || "",
                            ImporteActual: _parseImporteDisplay(oRow.ImporteActualDisplay),
                            ImporteAnterior: _parseImporteDisplay(oRow.ImporteAnteriorDisplay)
                        };
                    }
                }
            });

            return Object.values(oMap).sort(function (a, b) {
                return _compararCuentasJerarquico(a.Rg49Account, b.Rg49Account);
            });
        },

        /**
         * Calcula las cuentas de ganancias/pérdidas del Estado de Resultados.
         * Estas cuentas no vienen del reporte; se calculan a partir de las demás.
         */
        _calcularCuentasResultados: function (aData) {
            // Mapa de valores por cuenta nivel-1 (single segment)
            var oValoresMap = {};
            aData.forEach(function (oRow) {
                var sCuenta = (oRow.Rg49Account || "").toString();
                if (sCuenta.split('.').length === 1 && _parseCuentaSegmentos(sCuenta).length === 1) {
                    oValoresMap[sCuenta] = {
                        actual: Math.abs(parseFloat(oRow.ImporteActual) || 0),
                        anterior: Math.abs(parseFloat(oRow.ImporteAnterior) || 0)
                    };
                }
            });

            // Calcular cada cuenta en orden (dependen de las anteriores)
            CUENTAS_CALCULADAS_RESULTADOS.forEach(function (oCalc) {
                var fActual = 0, fAnterior = 0;
                oCalc.operandos.forEach(function (aOp) {
                    var oVal = oValoresMap[aOp[0]] || { actual: 0, anterior: 0 };
                    fActual += oVal.actual * aOp[1];
                    fAnterior += oVal.anterior * aOp[1];
                });

                // Guardar valor absoluto para fórmulas subsiguientes
                // (todos los valores deben ser positivos; el signo lo controla la fórmula)
                oValoresMap[oCalc.cuenta] = { actual: Math.abs(fActual), anterior: Math.abs(fAnterior) };

                // Actualizar o insertar en el array
                var bFound = false;
                for (var i = 0; i < aData.length; i++) {
                    if ((aData[i].Rg49Account || "").toString() === oCalc.cuenta) {
                        aData[i].ImporteActual = Math.abs(fActual);
                        aData[i].ImporteAnterior = Math.abs(fAnterior);
                        aData[i].Description = oCalc.descripcion;
                        bFound = true;
                        break;
                    }
                }

                if (!bFound) {
                    aData.push({
                        Rg49Account: oCalc.cuenta,
                        Description: oCalc.descripcion,
                        ImporteActual: Math.abs(fActual),
                        ImporteAnterior: Math.abs(fAnterior)
                    });
                }
            });

            // Re-ordenar
            aData.sort(function (a, b) {
                return _compararCuentasJerarquico(a.Rg49Account, b.Rg49Account);
            });

            return aData;
        },

        /**
         * Procesa datos para Anexo 3 (Flujo de Efectivo)
         * - Filtra cuentas 8000-8022 del nodo FLUJO
         * - Para año anterior: usa ImporteAnterior directo
         * - Para año vigente: agrupa por CashFlowPosition y suma ImporteActual
         * - Calcula subtotales para cuentas 8007, 8012, 8018, 8022
         */
        _procesarDatosParaFlujoEfectivo: function (aData) {
            // Paso 1: Encontrar nodo raíz FLUJO
            var oFlujoRoot = null;
            aData.forEach(function (o) {
                if (!oFlujoRoot && (o.Description || "").trim().toUpperCase() === "FLUJO") {
                    oFlujoRoot = o;
                }
            });
            if (!oFlujoRoot) {
                console.warn("Nodo FLUJO no encontrado en los datos");
                return [];
            }
            var sFlujoNodeId = (oFlujoRoot.NodeId || "").trim();

            // Paso 2: Extraer hijos directos (nivel 1) y nietos (nivel 2)
            var aLevel1 = [];
            var oLevel1Ids = {};

            aData.forEach(function (o) {
                if ((o.ParentId || "").trim() === sFlujoNodeId) {
                    aLevel1.push(o);
                    oLevel1Ids[(o.NodeId || "").trim()] = true;
                }
            });
            aLevel1.sort(function (a, b) { return (a.NodeId || "").localeCompare(b.NodeId || ""); });

            var oLevel2Map = {};
            aData.forEach(function (o) {
                var sParent = (o.ParentId || "").trim();
                if (oLevel1Ids[sParent]) {
                    if (!oLevel2Map[sParent]) oLevel2Map[sParent] = [];
                    oLevel2Map[sParent].push(o);
                }
            });
            Object.keys(oLevel2Map).forEach(function (k) {
                oLevel2Map[k].sort(function (a, b) { return (a.NodeId || "").localeCompare(b.NodeId || ""); });
            });

            // Paso 3: Construir mapa de sumas por CashFlowPosition para ImporteActual
            // (los nodos FLUJO tienen ImporteActual=0, los valores vienen de las cuentas regulares)
            var oCfpSumMap = {};
            aData.forEach(function (o) {
                var sCfp = (o.CashFlowPosition || "").toString().trim();
                if (sCfp && sCfp !== "0") {
                    if (!oCfpSumMap[sCfp]) oCfpSumMap[sCfp] = 0;
                    oCfpSumMap[sCfp] += parseFloat(o.ImporteActual) || 0;
                }
            });

            // Paso 4: Construir filas del estado de flujo recorriendo el árbol FLUJO
            var aResult = [];
            var aCurrentItems = [];

            aLevel1.forEach(function (oNode) {
                var sNodeId = (oNode.NodeId || "").trim();
                var aChildren = oLevel2Map[sNodeId] || [];
                var sCfp = (oNode.CashFlowPosition || "").toString().trim();

                if (aChildren.length > 0) {
                    // Nodo con hijos = sección (TITULO o TITULO_CON_VALOR)
                    var bTituloConValor = (sCfp === "17");

                    var oTituloRow = {
                        tipo: bTituloConValor ? "titulo_con_valor" : "titulo",
                        Description: oNode.Description || "",
                        ImporteVigente: bTituloConValor ? (oCfpSumMap[sCfp] || 0) : 0,
                        ImporteAnterior: bTituloConValor ? (parseFloat(oNode.ImporteAnterior) || 0) : 0
                    };
                    aResult.push(oTituloRow);

                    // Agregar hijos como ITEMS
                    aCurrentItems = [];
                    // Incluir titulo_con_valor en el subtotal siguiente
                    if (bTituloConValor) {
                        aCurrentItems.push(oTituloRow);
                    }
                    aChildren.forEach(function (oChild) {
                        var sChildCfp = (oChild.CashFlowPosition || "").toString().trim();
                        var oItem = {
                            tipo: "item",
                            Description: oChild.Description || "",
                            ImporteVigente: sChildCfp ? (oCfpSumMap[sChildCfp] || 0) : 0,
                            ImporteAnterior: parseFloat(oChild.ImporteAnterior) || 0
                        };
                        aResult.push(oItem);
                        aCurrentItems.push(oItem);
                    });
                } else {
                    // Nodo sin hijos = SUBTOTAL (calculado sumando los items de la sección anterior)
                    var fSumaVigente = 0;
                    var fSumaAnterior = 0;
                    aCurrentItems.forEach(function (oItem) {
                        fSumaVigente += oItem.ImporteVigente;
                        fSumaAnterior += oItem.ImporteAnterior;
                    });

                    aResult.push({
                        tipo: "subtotal",
                        Description: oNode.Description || "",
                        ImporteVigente: fSumaVigente,
                        ImporteAnterior: fSumaAnterior
                    });
                    aCurrentItems = [];
                }
            });

            return aResult;
        },

        /**
         * Procesa datos para Anexo 4 (Patrimonio)
         * Filtra cuentas que empiezan con '3' y agrega duplicados
         */
        _procesarDatosParaPatrimonio: function (aData) {
            var oMap = {};

            aData.forEach(function (oRow) {
                var sCuenta = (oRow.Rg49Account || "").toString();
                if (!sCuenta || sCuenta === "0") return;

                if (sCuenta.charAt(0) === '3') {
                    if (!oMap[sCuenta]) {
                        oMap[sCuenta] = {
                            Rg49Account: oRow.Rg49Account,
                            Description: oRow.Description || "",
                            ImporteActual: _parseImporteDisplay(oRow.ImporteActualDisplay),
                            ImporteAnterior: _parseImporteDisplay(oRow.ImporteAnteriorDisplay)
                        };
                    }
                }
            });

            return Object.values(oMap).sort(function (a, b) {
                return _compararCuentasJerarquico(a.Rg49Account, b.Rg49Account);
            });
        },

        // ============================================================
        // Utilidades de cuentas
        // ============================================================
        _obtenerCuentaPrincipal: function (sCuenta) {
            if (!sCuenta) return 0;
            var s = sCuenta.toString();
            return (s.length % 2 === 0) ? parseInt(s.substring(0, 2), 10) : parseInt(s.charAt(0), 10);
        },

        _formatearCuenta: function (sCuenta) {
            if (!sCuenta) return "";
            if (sCuenta.indexOf('.') > -1) return sCuenta;
            var s = sCuenta.toString();
            if (s.length <= 1) return s;
            var aPartes = [], sResto;
            if (s.length % 2 === 0) { aPartes.push(s.substring(0, 2)); sResto = s.substring(2); }
            else { aPartes.push(s.charAt(0)); sResto = s.substring(1); }
            while (sResto.length > 0) { aPartes.push(sResto.substring(0, 2)); sResto = sResto.substring(2); }
            return aPartes.join('.');
        },

        // ============================================================
        // Carga de pdfmake
        // ============================================================
        _loadPdfMake: function () {
            return new Promise(function (resolve, reject) {
                if (PdfExport._pdfMakeLoaded) { resolve(); return; }
                PdfExport._loadScript("pdfmake", PDFMAKE_URL).then(function () {
                    PdfExport._pdfMakeLoaded = true;
                    return PdfExport._loadScript("vfs_fonts", PDFMAKE_FONTS_URL);
                }).then(resolve).catch(reject);
            });
        },

        _loadScript: function (id, src) {
            return new Promise(function (resolve, reject) {
                if (document.getElementById(id)) { resolve(); return; }
                var s = document.createElement("script");
                s.id = id; s.src = src; s.onload = resolve; s.onerror = reject;
                document.head.appendChild(s);
            });
        },

        _readSociedadData: function () {
            var oModel = PdfExport._oModel;
            var sCompanyCode = PdfExport._oFilterData.sociedad;
            var oEmpty = {
                razonSocial: "", rucEmpresa: "", representanteLegal: "",
                contador: "", rucContador: "", auditor: "", rucAuditor: ""
            };

            return new Promise(function (resolve) {
                var oListBinding = oModel.bindList("/Sociedad", undefined, [], [
                    new Filter("CompanyCode", FilterOperator.EQ, sCompanyCode),
                    new Filter("IsActiveEntity", FilterOperator.EQ, true)
                ]);
                oListBinding.requestContexts(0, 1).then(function (aContexts) {
                    if (aContexts.length > 0) {
                        var oData = aContexts[0].getObject();
                        oListBinding.destroy();
                        resolve({
                            razonSocial: oData.RazonSocial || "",
                            rucEmpresa: oData.RucEmpresa || "",
                            representanteLegal: oData.RepresentanteLegal || "",
                            contador: oData.Contador || "",
                            rucContador: oData.RucContador || "",
                            auditor: oData.Auditor || "",
                            rucAuditor: oData.RucAuditor || ""
                        });
                    } else {
                        oListBinding.destroy();
                        resolve(oEmpty);
                    }
                }).catch(function (oError) {
                    console.warn("Error leyendo datos de Sociedad:", oError);
                    oListBinding.destroy();
                    resolve(oEmpty);
                });
            });
        },

        // ============================================================
        // DEFINICIÓN PDF GENÉRICA (Balance General / Estado de Resultados)
        // ============================================================
        _crearDefinicionPDF: function (oHeader, aData, oFilterData, oAnexoConfig) {
            var sEj = oFilterData.ejercicio;
            var sEjAnt = (parseInt(sEj) - 1).toString();
            var sDesde = _periodoAFecha(oFilterData.periodoDesde, sEj, false);
            var sHasta = _periodoAFecha(oFilterData.periodoHasta, sEj, true);
            var bHideAnterior = (oAnexoConfig.tipo === "balance" && PdfExport._bHideAnterior);

            var firmaBlock = PdfExport._getSignatureBlock();

            var buildHeader = function () {
                return {
                    stack: [
                        { text: oAnexoConfig.titulo, style: 'titulo', alignment: 'center', margin: [0, 10, 0, 5] },
                        { text: oAnexoConfig.subtitulo, style: 'subtitulo', alignment: 'center', margin: [0, 0, 0, 10] },
                        {
                            style: 'tablaHeader',
                            table: {
                                widths: ['*', 80, 60, 60],
                                body: [
                                    [
                                        { text: '1- IDENTIFICACIÓN DEL CONTRIBUYENTE', style: 'labelHeader', colSpan: 2, border: [true, true, true, true] }, {},
                                        { text: '2- EJERCICIO FISCAL', style: 'labelHeader', colSpan: 2, border: [true, true, true, true] }, {}
                                    ],
                                    [
                                        { text: 'RAZÓN SOCIAL O NOMBRES Y APELLIDOS', style: 'labelSmall' },
                                        { text: 'IDENTIFICADOR RUC', style: 'labelSmall', alignment: 'center' },
                                        { text: 'DESDE', style: 'labelSmall', alignment: 'center' },
                                        { text: 'HASTA', style: 'labelSmall', alignment: 'center' }
                                    ],
                                    [
                                        { text: oHeader.razonSocial, style: 'textoHeaderBold' },
                                        { text: oHeader.rucEmpresa, style: 'textoHeader', alignment: 'center' },
                                        { text: sDesde, style: 'textoHeader', alignment: 'center' },
                                        { text: sHasta, style: 'textoHeader', alignment: 'center' }
                                    ]
                                ]
                            }
                        },
                        { text: ' ', fontSize: 4 },
                        {
                            style: 'tablaHeader',
                            table: {
                                widths: [150, '*', 70, '*', 70],
                                body: [
                                    [
                                        { text: '3- IDENTIFICACIÓN DEL REPRESENTANTE LEGAL', style: 'labelHeader', border: [true, true, true, true] },
                                        { text: '4- IDENTIFICACIÓN DEL CONTADOR', style: 'labelHeader', colSpan: 2, border: [true, true, true, true] }, {},
                                        { text: '5- IDENTIFICACIÓN DEL AUDITOR', style: 'labelHeader', colSpan: 2, border: [true, true, true, true] }, {}
                                    ],
                                    [
                                        { text: 'APELLIDOS/NOMBRES', style: 'labelSmall' },
                                        { text: 'APELLIDOS/NOMBRES', style: 'labelSmall' },
                                        { text: 'RUC', style: 'labelSmall', alignment: 'center' },
                                        { text: 'APELLIDOS/NOMBRES', style: 'labelSmall' },
                                        { text: 'RUC', style: 'labelSmall', alignment: 'center' }
                                    ],
                                    [
                                        { text: oHeader.representanteLegal, style: 'textoHeader' },
                                        { text: oHeader.contador, style: 'textoHeader' },
                                        { text: oHeader.rucContador, style: 'textoHeader', alignment: 'center' },
                                        { text: oHeader.auditor, style: 'textoHeader' },
                                        { text: oHeader.rucAuditor, style: 'textoHeader', alignment: 'center' }
                                    ]
                                ]
                            }
                        }
                    ],
                    margin: [30, 20, 30, 10]
                };
            };

            var aFilasTabla;
            if (oAnexoConfig.tipo === "resultados") {
                aFilasTabla = PdfExport._crearFilasTablaResultados(aData, sEj, sEjAnt);
            } else {
                aFilasTabla = PdfExport._crearFilasTablaBalance(aData, sEj, sEjAnt, bHideAnterior);
            }

            var aWidths = bHideAnterior ? [55, '*', 70] : [55, '*', 70, 70];

            return {
                pageSize: 'LEGAL',
                pageOrientation: 'portrait',
                pageMargins: [30, 210, 30, 40],
                header: function () { return buildHeader(); },
                content: [
                    {
                        table: {
                            headerRows: 1, dontBreakRows: true, keepWithHeaderRows: 1,
                            widths: aWidths,
                            body: aFilasTabla
                        },
                        layout: {
                            hLineWidth: function (i, node) {
                                if (i === 0 || i === 1) return 0.8;
                                if (i === node.table.body.length) return 0.8;
                                return 0.3;
                            },
                            vLineWidth: function (i, node) { return (i === 0 || i === node.table.widths.length) ? 0.5 : 0; },
                            hLineColor: function (i, node) {
                                if (i === 0 || i === 1 || i === node.table.body.length) return '#333333';
                                return '#cccccc';
                            },
                            vLineColor: function () { return '#333333'; },
                            paddingLeft: function () { return 4; },
                            paddingRight: function () { return 4; },
                            paddingTop: function () { return 2; },
                            paddingBottom: function () { return 2; }
                        }
                    },
                    { text: '', margin: [0, 40, 0, 0] },
                    { stack: [firmaBlock], unbreakable: true }
                ],
                styles: {
                    titulo: { fontSize: 14, bold: true },
                    subtitulo: { fontSize: 11, bold: true },
                    tablaHeader: { margin: [0, 0, 0, 0] },
                    labelHeader: { fontSize: 7, bold: true, fillColor: '#e0e0e0', margin: [2, 2, 2, 2] },
                    labelSmall: { fontSize: 6, italics: true, color: '#555555', margin: [2, 0, 2, 0] },
                    textoHeader: { fontSize: 8, margin: [2, 2, 2, 2] },
                    textoHeaderBold: { fontSize: 8, bold: true, margin: [2, 2, 2, 2] },
                    headerColumna: { fontSize: 8, bold: true, alignment: 'center', fillColor: '#f5f5f5', margin: [0, 4, 0, 4] },
                    nivel1: { fontSize: 8, bold: true }, nivel2: { fontSize: 8, bold: true },
                    nivel3: { fontSize: 8, bold: true }, nivel4: { fontSize: 7.5 },
                    nivel5: { fontSize: 7.5 }, nivel6: { fontSize: 7 },
                    erNivel1: { fontSize: 8, bold: true }, erNivel2: { fontSize: 8 },
                    erNivel3: { fontSize: 7.5 }, erNivel4: { fontSize: 7.5 },
                    separador: { fontSize: 8, bold: true, decoration: 'underline' },
                    importeBold: { fontSize: 8, bold: true, alignment: 'right' },
                    importeNormal: { fontSize: 7.5, alignment: 'right' },
                    firmaTexto: { fontSize: 8, alignment: 'center', bold: true }
                },
                defaultStyle: { font: 'Roboto' }
            };
        },

        _crearFilasTablaBalance: function (aData, sActual, sAnterior, bHideAnterior) {
            var aRows = [];

            if (bHideAnterior) {
                aRows.push([
                    { text: '', style: 'headerColumna' },
                    { text: '', style: 'headerColumna' },
                    { text: sActual, style: 'headerColumna' }
                ]);
            } else {
                aRows.push([
                    { text: '', style: 'headerColumna' },
                    { text: '', style: 'headerColumna' },
                    { text: sActual, style: 'headerColumna' },
                    { text: sAnterior, style: 'headerColumna' }
                ]);
            }

            var iPrevLevel = 0;
            aData.forEach(function (oRow, index) {
                var sCuenta = PdfExport._formatearCuenta(oRow.Rg49Account || "");
                var sDescripcion = oRow.Description || "";
                var fVal1 = Math.abs(parseFloat(oRow.ImporteActual) || 0);
                var fVal2 = Math.abs(parseFloat(oRow.ImporteAnterior) || 0);

                var iLevel = sCuenta.split('.').length;
                var styleDesc = 'nivel4', styleImp = 'importeNormal', marginL = 18, marginTop = 1;

                if (index > 0) {
                    if (iLevel === 1) marginTop = 12;
                    else if (iLevel === 2 && iPrevLevel !== 1) marginTop = 8;
                    else if (iLevel === 3 && iPrevLevel > 3) marginTop = 5;
                }

                if (iLevel === 1) { styleDesc = 'nivel1'; styleImp = 'importeBold'; marginL = 0; }
                else if (iLevel === 2) { styleDesc = 'nivel2'; styleImp = 'importeBold'; marginL = 5; }
                else if (iLevel === 3) { styleDesc = 'nivel3'; styleImp = 'importeBold'; marginL = 10; }
                else if (iLevel === 4) { styleDesc = 'nivel4'; styleImp = 'importeNormal'; marginL = 15; }
                else if (iLevel === 5) { styleDesc = 'nivel5'; styleImp = 'importeNormal'; marginL = 20; }
                else { styleDesc = 'nivel6'; styleImp = 'importeNormal'; marginL = 25; }

                var aRow = [
                    { text: sCuenta, style: styleDesc, margin: [0, marginTop, 0, 1] },
                    { text: sDescripcion, style: styleDesc, margin: [marginL, marginTop, 0, 1] },
                    { text: fmt(fVal1), style: styleImp, margin: [0, marginTop, 0, 1] }
                ];
                if (!bHideAnterior) {
                    aRow.push({ text: fmt(fVal2), style: styleImp, margin: [0, marginTop, 0, 1] });
                }
                aRows.push(aRow);
                iPrevLevel = iLevel;
            });
            return aRows;
        },

        _crearFilasTablaResultados: function (aData, sActual, sAnterior) {
            var aRows = [];
            aRows.push([
                { text: '', style: 'headerColumna' },
                { text: '', style: 'headerColumna' },
                { text: sActual, style: 'headerColumna' },
                { text: sAnterior, style: 'headerColumna' }
            ]);

            aData.forEach(function (oRow) {
                var sCuentaRaw = (oRow.Rg49Account || "").toString();
                var sCuenta = PdfExport._formatearCuenta(sCuentaRaw);
                var sDescripcion = oRow.Description || "";
                var fVal1 = Math.abs(parseFloat(oRow.ImporteActual) || 0);
                var fVal2 = Math.abs(parseFloat(oRow.ImporteAnterior) || 0);

                var iLevel = sCuenta.split('.').length;
                var iCuentaPrincipal = PdfExport._obtenerCuentaPrincipal(sCuentaRaw);
                var sCuentaPrincipalStr = iCuentaPrincipal.toString();

                if (iLevel === 1 && ESTADO_RESULTADOS_SEPARADORES[sCuentaPrincipalStr]) {
                    aRows.push([
                        { text: '', margin: [0, 10, 0, 2] },
                        { text: ESTADO_RESULTADOS_SEPARADORES[sCuentaPrincipalStr], style: 'separador', margin: [0, 10, 0, 2] },
                        { text: '', margin: [0, 10, 0, 2] },
                        { text: '', margin: [0, 10, 0, 2] }
                    ]);
                }

                var styleDesc = 'erNivel3', styleImp = 'importeNormal', marginL = 10, marginTop = 2, marginBottom = 1;
                if (iLevel === 1) { styleDesc = 'erNivel1'; styleImp = 'importeBold'; marginL = 0; marginTop = 4; }
                else if (iLevel === 2) { styleDesc = 'erNivel2'; marginL = 5; }
                else if (iLevel === 3) { styleDesc = 'erNivel3'; marginL = 10; }
                else { styleDesc = 'erNivel4'; marginL = 15; }

                if (CUENTAS_TOTALES_CALCULADOS[sCuentaPrincipalStr]) { marginTop = 10; marginBottom = 10; }

                aRows.push([
                    { text: sCuenta, style: styleDesc, margin: [0, marginTop, 0, marginBottom] },
                    { text: sDescripcion, style: styleDesc, margin: [marginL, marginTop, 0, marginBottom] },
                    { text: fmt(fVal1), style: styleImp, margin: [0, marginTop, 0, marginBottom] },
                    { text: fmt(fVal2), style: styleImp, margin: [0, marginTop, 0, marginBottom] }
                ]);
            });
            return aRows;
        },

        // ============================================================
        // DEFINICIÓN PDF PARA ANEXO 3 - ESTADO DE FLUJO DE EFECTIVO
        // ============================================================
        _crearDefinicionPDFFlujoEfectivo: function (oHeader, aData, oFilterData, oAnexoConfig) {
            var sEj = oFilterData.ejercicio;
            var sEjAnt = (parseInt(sEj) - 1).toString();
            var sDesde = _periodoAFecha(oFilterData.periodoDesde, sEj, false);
            var sHasta = _periodoAFecha(oFilterData.periodoHasta, sEj, true);

            var firmaBlock = PdfExport._getSignatureBlock();

            var buildHeader = function () {
                return {
                    stack: [
                        { text: oAnexoConfig.titulo, style: 'titulo', alignment: 'center', margin: [0, 10, 0, 5] },
                        { text: oAnexoConfig.subtitulo, style: 'subtitulo', alignment: 'center', margin: [0, 0, 0, 10] },
                        {
                            style: 'tablaHeader',
                            table: {
                                widths: ['*', 80, 60, 60],
                                body: [
                                    [
                                        { text: '1- IDENTIFICACIÓN DEL CONTRIBUYENTE', style: 'labelHeader', colSpan: 2, border: [true, true, true, true] },
                                        {},
                                        { text: '2- EJERCICIO FISCAL', style: 'labelHeader', colSpan: 2, border: [true, true, true, true] },
                                        {}
                                    ],
                                    [
                                        { text: 'RAZÓN SOCIAL O NOMBRES Y APELLIDOS', style: 'labelSmall' },
                                        { text: 'IDENTIFICADOR RUC', style: 'labelSmall', alignment: 'center' },
                                        { text: 'DESDE', style: 'labelSmall', alignment: 'center' },
                                        { text: 'HASTA', style: 'labelSmall', alignment: 'center' }
                                    ],
                                    [
                                        { text: oHeader.razonSocial, style: 'textoHeaderBold' },
                                        { text: oHeader.rucEmpresa, style: 'textoHeader', alignment: 'center' },
                                        { text: sDesde, style: 'textoHeader', alignment: 'center' },
                                        { text: sHasta, style: 'textoHeader', alignment: 'center' }
                                    ]
                                ]
                            }
                        },
                        { text: ' ', fontSize: 4 },
                        {
                            style: 'tablaHeader',
                            table: {
                                widths: [150, '*', 70, '*', 70],
                                body: [
                                    [
                                        { text: '3- IDENTIFICACIÓN DEL REPRESENTANTE LEGAL', style: 'labelHeader', border: [true, true, true, true] },
                                        { text: '4- IDENTIFICACIÓN DEL CONTADOR', style: 'labelHeader', colSpan: 2, border: [true, true, true, true] },
                                        {},
                                        { text: '5- IDENTIFICACIÓN DEL AUDITOR', style: 'labelHeader', colSpan: 2, border: [true, true, true, true] },
                                        {}
                                    ],
                                    [
                                        { text: 'APELLIDOS/NOMBRES', style: 'labelSmall' },
                                        { text: 'APELLIDOS/NOMBRES', style: 'labelSmall' },
                                        { text: 'RUC', style: 'labelSmall', alignment: 'center' },
                                        { text: 'APELLIDOS/NOMBRES', style: 'labelSmall' },
                                        { text: 'RUC', style: 'labelSmall', alignment: 'center' }
                                    ],
                                    [
                                        { text: oHeader.representanteLegal, style: 'textoHeader' },
                                        { text: oHeader.contador, style: 'textoHeader' },
                                        { text: oHeader.rucContador, style: 'textoHeader', alignment: 'center' },
                                        { text: oHeader.auditor, style: 'textoHeader' },
                                        { text: oHeader.rucAuditor, style: 'textoHeader', alignment: 'center' }
                                    ]
                                ]
                            }
                        }
                    ],
                    margin: [30, 20, 30, 10]
                };
            };

            var aFilasTabla = PdfExport._crearFilasTablaFlujoEfectivo(aData, sEj, sEjAnt);

            return {
                pageSize: 'LEGAL',
                pageOrientation: 'portrait',
                pageMargins: [30, 210, 30, 40],

                header: function () { return buildHeader(); },

                content: [
                    {
                        table: {
                            headerRows: 1,
                            dontBreakRows: true,
                            keepWithHeaderRows: 1,
                            widths: ['*', 85, 85],
                            body: aFilasTabla
                        },
                        layout: {
                            hLineWidth: function (i, node) {
                                if (i === 0 || i === 1) return 0.8;
                                if (i === node.table.body.length) return 0.8;
                                return 0.3;
                            },
                            vLineWidth: function (i, node) {
                                return (i === 0 || i === node.table.widths.length) ? 0.5 : 0.3;
                            },
                            hLineColor: function (i, node) {
                                if (i === 0 || i === 1 || i === node.table.body.length) return '#333333';
                                return '#cccccc';
                            },
                            vLineColor: function () { return '#333333'; },
                            paddingLeft: function () { return 4; },
                            paddingRight: function () { return 4; },
                            paddingTop: function () { return 3; },
                            paddingBottom: function () { return 3; }
                        }
                    },
                    { text: '', margin: [0, 40, 0, 0] },
                    { stack: [firmaBlock], unbreakable: true }
                ],

                styles: {
                    titulo: { fontSize: 14, bold: true },
                    subtitulo: { fontSize: 11, bold: true },
                    tablaHeader: { margin: [0, 0, 0, 0] },
                    labelHeader: { fontSize: 7, bold: true, fillColor: '#e0e0e0', margin: [2, 2, 2, 2] },
                    labelSmall: { fontSize: 6, italics: true, color: '#555555', margin: [2, 0, 2, 0] },
                    textoHeader: { fontSize: 8, margin: [2, 2, 2, 2] },
                    textoHeaderBold: { fontSize: 8, bold: true, margin: [2, 2, 2, 2] },
                    headerColumna: { fontSize: 8, bold: true, alignment: 'center', fillColor: '#f5f5f5', margin: [0, 4, 0, 4] },
                    flujoTitulo: { fontSize: 8, bold: true, fillColor: '#e8e8e8' },
                    flujoSubtotal: { fontSize: 8, bold: true, fillColor: '#e8e8e8' },
                    flujoItem: { fontSize: 7.5 },
                    importeBold: { fontSize: 8, bold: true, alignment: 'right' },
                    importeNormal: { fontSize: 7.5, alignment: 'right' },
                    firmaTexto: { fontSize: 8, alignment: 'center', bold: true }
                },
                defaultStyle: { font: 'Roboto' }
            };
        },

        /**
         * Crea las filas de la tabla del Estado de Flujo de Efectivo
         */
        _crearFilasTablaFlujoEfectivo: function (aData, sActual, sAnterior) {
            var aRows = [];

            aRows.push([
                { text: '', style: 'headerColumna' },
                { text: sActual, style: 'headerColumna' },
                { text: sAnterior, style: 'headerColumna' }
            ]);

            aData.forEach(function (oRow) {
                var sDescripcion = oRow.Description || "";
                var fValVigente = oRow.ImporteVigente || 0;
                var fValAnterior = oRow.ImporteAnterior || 0;
                var sTipo = oRow.tipo || "item";

                if (sTipo === "titulo") {
                    aRows.push([
                        { text: sDescripcion.toUpperCase(), style: 'flujoTitulo', margin: [0, 4, 0, 4] },
                        { text: '', style: 'flujoTitulo' },
                        { text: '', style: 'flujoTitulo' }
                    ]);
                } else if (sTipo === "titulo_con_valor") {
                    aRows.push([
                        { text: sDescripcion.toUpperCase(), style: 'flujoTitulo', margin: [0, 4, 0, 4] },
                        { text: fmtFlujo(fValVigente), style: 'importeBold', fillColor: '#e8e8e8', margin: [0, 4, 0, 4] },
                        { text: fmtFlujo(fValAnterior), style: 'importeBold', fillColor: '#e8e8e8', margin: [0, 4, 0, 4] }
                    ]);
                } else if (sTipo === "subtotal") {
                    aRows.push([
                        { text: sDescripcion.toUpperCase(), style: 'flujoSubtotal', margin: [0, 4, 0, 4] },
                        { text: fmtFlujo(fValVigente), style: 'importeBold', fillColor: '#e8e8e8', margin: [0, 4, 0, 4] },
                        { text: fmtFlujo(fValAnterior), style: 'importeBold', fillColor: '#e8e8e8', margin: [0, 4, 0, 4] }
                    ]);
                } else {
                    aRows.push([
                        { text: sDescripcion, style: 'flujoItem', margin: [10, 2, 0, 2] },
                        { text: fmtFlujo(fValVigente), style: 'importeNormal' },
                        { text: fmtFlujo(fValAnterior), style: 'importeNormal' }
                    ]);
                }
            });

            return aRows;
        },

        // ============================================================
        // DEFINICIÓN PDF PARA ANEXO 4 - ESTADO DE CAMBIOS DEL PATRIMONIO
        // ============================================================
        _crearDefinicionPDFPatrimonio: function (oHeader, aData, oFilterData, oAnexoConfig) {
            var sEj = oFilterData.ejercicio;
            var sEjAnt = (parseInt(sEj) - 1).toString();
            var sDesde = _periodoAFecha(oFilterData.periodoDesde, sEj, false);
            var sHasta = _periodoAFecha(oFilterData.periodoHasta, sEj, true);

            var oPatrimonioData = PdfExport._extraerDatosPatrimonio(aData, sEj, sEjAnt);
            var aFilasTabla = PdfExport._crearFilasTablaPatrimonio(oPatrimonioData, sEj, sEjAnt);

            return {
                pageSize: 'LEGAL',
                pageOrientation: 'landscape',
                pageMargins: [100, 30, 100, 30],

                content: [
                    { text: oAnexoConfig.titulo, style: 'titulo', alignment: 'center', margin: [0, 0, 0, 5] },
                    { text: oAnexoConfig.subtitulo, style: 'subtitulo', alignment: 'center', margin: [0, 0, 0, 10] },
                    {
                        table: {
                            widths: ['*', 100, 70, 70],
                            body: [
                                [
                                    { text: '1- IDENTIFICACIÓN DEL CONTRIBUYENTE', style: 'labelHeader', colSpan: 2, border: [true, true, true, true] },
                                    {},
                                    { text: '2- EJERCICIO FISCAL', style: 'labelHeader', colSpan: 2, border: [true, true, true, true] },
                                    {}
                                ],
                                [
                                    { text: 'RAZÓN SOCIAL O NOMBRES Y APELLIDOS', style: 'labelSmall' },
                                    { text: 'IDENTIFICADOR RUC', style: 'labelSmall', alignment: 'center' },
                                    { text: 'DESDE', style: 'labelSmall', alignment: 'center' },
                                    { text: 'HASTA', style: 'labelSmall', alignment: 'center' }
                                ],
                                [
                                    { text: oHeader.razonSocial, style: 'textoHeaderBold' },
                                    { text: oHeader.rucEmpresa, style: 'textoHeader', alignment: 'center' },
                                    { text: sDesde, style: 'textoHeader', alignment: 'center' },
                                    { text: sHasta, style: 'textoHeader', alignment: 'center' }
                                ]
                            ]
                        },
                        margin: [0, 0, 0, 4]
                    },
                    {
                        table: {
                            widths: [180, '*', 80, '*', 80],
                            body: [
                                [
                                    { text: '3- IDENTIFICACIÓN DEL REPRESENTANTE LEGAL', style: 'labelHeader', border: [true, true, true, true] },
                                    { text: '4- IDENTIFICACIÓN DEL CONTADOR', style: 'labelHeader', colSpan: 2, border: [true, true, true, true] },
                                    {},
                                    { text: '5- IDENTIFICACIÓN DEL AUDITOR', style: 'labelHeader', colSpan: 2, border: [true, true, true, true] },
                                    {}
                                ],
                                [
                                    { text: 'APELLIDOS/NOMBRES', style: 'labelSmall' },
                                    { text: 'APELLIDOS/NOMBRES', style: 'labelSmall' },
                                    { text: 'RUC', style: 'labelSmall', alignment: 'center' },
                                    { text: 'APELLIDOS/NOMBRES', style: 'labelSmall' },
                                    { text: 'RUC', style: 'labelSmall', alignment: 'center' }
                                ],
                                [
                                    { text: oHeader.representanteLegal, style: 'textoHeader' },
                                    { text: oHeader.contador, style: 'textoHeader' },
                                    { text: oHeader.rucContador, style: 'textoHeader', alignment: 'center' },
                                    { text: oHeader.auditor, style: 'textoHeader' },
                                    { text: oHeader.rucAuditor, style: 'textoHeader', alignment: 'center' }
                                ]
                            ]
                        },
                        margin: [0, 0, 0, 12]
                    },
                    {
                        table: {
                            headerRows: 2,
                            dontBreakRows: true,
                            keepWithHeaderRows: 1,
                            widths: ['*', 75, 65, 65, 65, 80, 80, 85],
                            body: aFilasTabla
                        },
                        layout: {
                            hLineWidth: function (i, node) {
                                if (i === 0 || i === 2) return 0.8;
                                if (i === node.table.body.length) return 0.8;
                                return 0.3;
                            },
                            vLineWidth: function (i, node) {
                                return (i === 0 || i === node.table.widths.length) ? 0.5 : 0.3;
                            },
                            hLineColor: function (i, node) {
                                if (i === 0 || i === 2 || i === node.table.body.length) return '#333333';
                                return '#cccccc';
                            },
                            vLineColor: function () { return '#333333'; },
                            paddingLeft: function () { return 4; },
                            paddingRight: function () { return 4; },
                            paddingTop: function () { return 2; },
                            paddingBottom: function () { return 2; }
                        }
                    },
                    {
                        unbreakable: true,
                        stack: [
                            { text: '', margin: [0, 12, 0, 0] },
                            {
                                table: {
                                    widths: ['*', 20, '*', 20, '*'],
                                    body: [
                                        [
                                            { text: '____________________________', alignment: 'center', margin: [0, 15, 0, 3] },
                                            {},
                                            { text: '____________________________', alignment: 'center', margin: [0, 15, 0, 3] },
                                            {},
                                            { text: '____________________________', alignment: 'center', margin: [0, 15, 0, 3] }
                                        ],
                                        [
                                            { text: 'REPRESENTANTE LEGAL', style: 'firmaTexto' },
                                            {},
                                            { text: 'REPRESENTANTE LEGAL (Socio)', style: 'firmaTexto' },
                                            {},
                                            { text: 'CONTADOR/A', style: 'firmaTexto' }
                                        ]
                                    ]
                                },
                                layout: 'noBorders'
                            }
                        ]
                    }
                ],

                styles: {
                    titulo: { fontSize: 14, bold: true },
                    subtitulo: { fontSize: 11, bold: true },
                    labelHeader: { fontSize: 7, bold: true, fillColor: '#e0e0e0', margin: [2, 2, 2, 2] },
                    labelSmall: { fontSize: 6, italics: true, color: '#555555', margin: [2, 0, 2, 0] },
                    textoHeader: { fontSize: 8, margin: [2, 2, 2, 2] },
                    textoHeaderBold: { fontSize: 8, bold: true, margin: [2, 2, 2, 2] },
                    headerColumna: { fontSize: 7, bold: true, alignment: 'center', fillColor: '#f5f5f5', margin: [0, 3, 0, 3] },
                    headerColumnaTop: { fontSize: 7, bold: true, alignment: 'center', fillColor: '#e8e8e8', margin: [0, 2, 0, 2] },
                    filaTitulo: { fontSize: 7, bold: true },
                    filaMovimiento: { fontSize: 6.5 },
                    importeBold: { fontSize: 7, bold: true, alignment: 'right' },
                    importeNormal: { fontSize: 6.5, alignment: 'right' },
                    firmaTexto: { fontSize: 8, alignment: 'center', bold: true }
                },
                defaultStyle: { font: 'Roboto' }
            };
        },

        /**
         * Extrae datos de patrimonio desde las cuentas del grupo 3
         */
        _extraerDatosPatrimonio: function (aData, sEjActual, sEjAnterior) {
            var oCuentasMap = {};
            aData.forEach(function (oRow) {
                var sCuenta = (oRow.Rg49Account || "").toString().replace(/\./g, '');
                oCuentasMap[sCuenta] = {
                    descripcion: oRow.Description || "",
                    importeActual: parseFloat(oRow.ImporteActual) || 0,
                    importeAnterior: parseFloat(oRow.ImporteAnterior) || 0
                };
            });

            var getValor = function (sCuenta, campo) {
                if (oCuentasMap[sCuenta]) {
                    return campo === 'actual' ? oCuentasMap[sCuenta].importeActual : oCuentasMap[sCuenta].importeAnterior;
                }
                return 0;
            };

            var oPatrimonio = {
                capitalIntegrado_2024: Math.abs(getValor("30101", "anterior")),
                resultadoAcumulado_2024: getValor("30", "anterior"),
                resultadoEjercicioInicio_2024: getValor("31", "anterior"),
                transferenciaDividendos_2024: getValor("33", "anterior"),
                resultadoEjercicio_2024: getValor("30302", "anterior"),
                transferenciaResultados_2025: getValor("30302", "anterior"),
                resultadoEjercicio_2025: getValor("30302", "actual")
            };

            return oPatrimonio;
        },

        /**
         * Crea las filas de la tabla del Estado de Cambios del Patrimonio Neto
         */
        _crearFilasTablaPatrimonio: function (oPatrimonio, sEjActual, sEjAnterior) {
            var aRows = [];

            var fmtOrDash = function (v) {
                if (v === 0 || v === null || v === undefined || isNaN(v)) return '-';
                return fmt(v);
            };

            var fmtOrEmpty = function (v) {
                if (v === 0 || v === null || v === undefined || isNaN(v)) return '';
                return fmt(v);
            };

            // ---- HEADER DE COLUMNAS (2 filas) ----
            aRows.push([
                { text: '', style: 'headerColumnaTop', rowSpan: 2 },
                { text: 'CAPITAL', style: 'headerColumnaTop' },
                { text: 'RESERVAS', style: 'headerColumnaTop', colSpan: 3, alignment: 'center' },
                {},
                {},
                { text: 'RESULTADOS', style: 'headerColumnaTop', colSpan: 2, alignment: 'center' },
                {},
                { text: 'PATRIMONIO', style: 'headerColumnaTop' }
            ]);

            aRows.push([
                { text: 'CUENTAS', style: 'headerColumna' },
                { text: 'INTEGRADO', style: 'headerColumna' },
                { text: 'LEGAL', style: 'headerColumna' },
                { text: 'DE REVALÚO', style: 'headerColumna' },
                { text: 'OTRAS', style: 'headerColumna' },
                { text: 'ACUMULADOS', style: 'headerColumna' },
                { text: 'DEL EJERCICIO', style: 'headerColumna' },
                { text: 'NETO', style: 'headerColumna' }
            ]);

            // ---- SALDO AL INICIO DEL EJERCICIO ANTERIOR ----
            var saldoInicio2024 = [
                oPatrimonio.capitalIntegrado_2024,   // [0] Capital Integrado
                0,                                     // [1] Reserva Legal
                0,                                     // [2] Reserva Revalúo
                0,                                     // [3] Otras Reservas
                oPatrimonio.resultadoAcumulado_2024,   // [4] Resultados Acumulados
                oPatrimonio.resultadoEjercicioInicio_2024, // [5] Resultado del Ejercicio
                0                                      // [6] Patrimonio Neto
            ];
            saldoInicio2024[6] = saldoInicio2024[0] + saldoInicio2024[4] + saldoInicio2024[5];

            aRows.push([
                { text: 'SALDO AL INICIO DEL EJERCICIO ' + sEjAnterior, style: 'filaTitulo', margin: [0, 2, 0, 2] },
                { text: fmtOrDash(saldoInicio2024[0]), style: 'importeBold' },
                { text: fmtOrDash(saldoInicio2024[1]), style: 'importeBold' },
                { text: fmtOrDash(saldoInicio2024[2]), style: 'importeBold' },
                { text: fmtOrDash(saldoInicio2024[3]), style: 'importeBold' },
                { text: fmtOrDash(saldoInicio2024[4]), style: 'importeBold' },
                { text: fmtOrDash(saldoInicio2024[5]), style: 'importeBold' },
                { text: fmtOrDash(saldoInicio2024[6]), style: 'importeBold' }
            ]);

            // ---- MOVIMIENTOS DEL EJERCICIO ANTERIOR ----
            aRows.push([
                { text: 'MOVIMIENTOS DEL EJERCICIO ' + sEjAnterior, style: 'filaTitulo', margin: [0, 2, 0, 2] },
                { text: '', style: 'importeBold' },
                { text: '', style: 'importeBold' },
                { text: '', style: 'importeBold' },
                { text: '', style: 'importeBold' },
                { text: '', style: 'importeBold' },
                { text: '', style: 'importeBold' },
                { text: '', style: 'importeBold' }
            ]);

            var crearFilaMovimientoVacio = function (sTexto) {
                return [
                    { text: sTexto, style: 'filaMovimiento', margin: [10, 1, 0, 1] },
                    { text: '', style: 'importeNormal', alignment: 'center' },
                    { text: '', style: 'importeNormal', alignment: 'center' },
                    { text: '', style: 'importeNormal', alignment: 'center' },
                    { text: '', style: 'importeNormal', alignment: 'center' },
                    { text: '', style: 'importeNormal', alignment: 'center' },
                    { text: '', style: 'importeNormal', alignment: 'center' },
                    { text: '', style: 'importeNormal', alignment: 'center' }
                ];
            };

            aRows.push(crearFilaMovimientoVacio('INTEGRACIÓN DE CAPITAL'));

            // Transferencia a Dividendos a Pagar (año anterior)
            var transferenciaDividendos2024 = oPatrimonio.transferenciaDividendos_2024;
            aRows.push([
                { text: 'TRANSFERENCIA A DIVIDENDOS A PAGAR', style: 'filaMovimiento', margin: [10, 1, 0, 1] },
                { text: '', style: 'importeNormal', alignment: 'center' },
                { text: '', style: 'importeNormal', alignment: 'center' },
                { text: '', style: 'importeNormal', alignment: 'center' },
                { text: '', style: 'importeNormal', alignment: 'center' },
                { text: fmtOrEmpty(transferenciaDividendos2024), style: 'importeNormal' },
                { text: fmtOrEmpty(transferenciaDividendos2024), style: 'importeNormal' },
                { text: '', style: 'importeNormal', alignment: 'center' }
            ]);

            aRows.push(crearFilaMovimientoVacio('AJUSTES/DESAFECTAC. DE RESULT. ACUMULADOS'));
            aRows.push(crearFilaMovimientoVacio('RESERVA LEGAL'));
            aRows.push(crearFilaMovimientoVacio('RESERVA DE REVALÚO'));
            aRows.push(crearFilaMovimientoVacio('OTRAS RESERVAS'));

            // ---- RESULTADO DEL EJERCICIO ANTERIOR (signo invertido) ----
            var resultadoEjercicio2024 = -oPatrimonio.resultadoEjercicio_2024;
            aRows.push([
                { text: 'RESULTADO DEL EJERCICIO ' + sEjAnterior, style: 'filaTitulo', margin: [0, 2, 0, 2] },
                { text: '', style: 'importeBold', alignment: 'center' },
                { text: '', style: 'importeBold', alignment: 'center' },
                { text: '', style: 'importeBold', alignment: 'center' },
                { text: '', style: 'importeBold', alignment: 'center' },
                { text: '', style: 'importeBold', alignment: 'center' },
                { text: fmtOrEmpty(resultadoEjercicio2024), style: 'importeBold' },
                { text: fmtOrEmpty(resultadoEjercicio2024), style: 'importeBold' }
            ]);

            // ---- SALDO AL CIERRE DEL EJERCICIO ANTERIOR = INICIO DEL ACTUAL ----
            var saldoCierre2024 = [
                saldoInicio2024[0],                              // [0] Capital Integrado
                0,                                                // [1] Reserva Legal
                0,                                                // [2] Reserva Revalúo
                0,                                                // [3] Otras Reservas
                saldoInicio2024[4] + transferenciaDividendos2024, // [4] Resultados Acumulados
                resultadoEjercicio2024,                           // [5] Resultado del Ejercicio
                0                                                 // [6] Patrimonio Neto
            ];
            saldoCierre2024[6] = saldoInicio2024[6] + resultadoEjercicio2024;

            aRows.push([
                { text: 'SALDO AL CIERRE DEL EJERCICIO ' + sEjAnterior + ' = INICIO DEL EJERCICIO ' + sEjActual, style: 'filaTitulo', margin: [0, 2, 0, 2] },
                { text: fmtOrDash(saldoCierre2024[0]), style: 'importeBold' },
                { text: fmtOrDash(saldoCierre2024[1]), style: 'importeBold' },
                { text: fmtOrDash(saldoCierre2024[2]), style: 'importeBold' },
                { text: fmtOrDash(saldoCierre2024[3]), style: 'importeBold' },
                { text: fmtOrDash(saldoCierre2024[4]), style: 'importeBold' },
                { text: fmtOrDash(saldoCierre2024[5]), style: 'importeBold' },
                { text: fmtOrDash(saldoCierre2024[6]), style: 'importeBold' }
            ]);

            // ---- MOVIMIENTOS DEL EJERCICIO ACTUAL ----
            aRows.push([
                { text: 'MOVIMIENTOS DEL EJERCICIO ' + sEjActual, style: 'filaTitulo', margin: [0, 2, 0, 2] },
                { text: '', style: 'importeBold' },
                { text: '', style: 'importeBold' },
                { text: '', style: 'importeBold' },
                { text: '', style: 'importeBold' },
                { text: '', style: 'importeBold' },
                { text: '', style: 'importeBold' },
                { text: '', style: 'importeBold' }
            ]);

            aRows.push(crearFilaMovimientoVacio('INTEGRACIÓN DE CAPITAL'));
            aRows.push(crearFilaMovimientoVacio('TRANSFERENCIA A DIVIDENDOS A PAGAR'));

            // Transferencia a Resultados Acumulados (año actual) — signo invertido para coincidir con resultado del ejercicio
            var transferenciaResultados2025 = -oPatrimonio.transferenciaResultados_2025;
            aRows.push([
                { text: 'TRANSFERENCIA A RESULTADOS ACUMULADOS', style: 'filaMovimiento', margin: [10, 1, 0, 1] },
                { text: '', style: 'importeNormal', alignment: 'center' },
                { text: '', style: 'importeNormal', alignment: 'center' },
                { text: '', style: 'importeNormal', alignment: 'center' },
                { text: '', style: 'importeNormal', alignment: 'center' },
                { text: fmtOrEmpty(transferenciaResultados2025), style: 'importeNormal' },
                { text: fmtOrEmpty(-transferenciaResultados2025), style: 'importeNormal' },
                { text: '', style: 'importeNormal', alignment: 'center' }
            ]);

            aRows.push(crearFilaMovimientoVacio('RESERVA LEGAL'));
            aRows.push(crearFilaMovimientoVacio('RESERVA DE REVALÚO'));
            aRows.push(crearFilaMovimientoVacio('OTRAS RESERVAS'));

            // ---- RESULTADO DEL EJERCICIO ACTUAL ----
            var resultadoEjercicio2025 = oPatrimonio.resultadoEjercicio_2025;
            var resultadoEjercicio2025Negativo = -resultadoEjercicio2025;
            aRows.push([
                { text: 'RESULTADO DEL EJERCICIO ' + sEjActual, style: 'filaTitulo', margin: [0, 2, 0, 2] },
                { text: '', style: 'importeBold', alignment: 'center' },
                { text: '', style: 'importeBold', alignment: 'center' },
                { text: '', style: 'importeBold', alignment: 'center' },
                { text: '', style: 'importeBold', alignment: 'center' },
                { text: '', style: 'importeBold', alignment: 'center' },
                { text: fmtOrEmpty(resultadoEjercicio2025Negativo), style: 'importeBold' },
                { text: fmtOrEmpty(resultadoEjercicio2025Negativo), style: 'importeBold' }
            ]);

            // ---- SALDO AL CIERRE DEL EJERCICIO ACTUAL ----
            var saldoCierre2025 = [
                saldoInicio2024[0],                                  // [0] Capital Integrado
                0,                                                    // [1] Reserva Legal
                0,                                                    // [2] Reserva Revalúo
                0,                                                    // [3] Otras Reservas
                saldoCierre2024[4] + transferenciaResultados2025,     // [4] Resultados Acumulados
                resultadoEjercicio2025Negativo,                       // [5] Resultado del Ejercicio
                0                                                     // [6] Patrimonio Neto
            ];
            saldoCierre2025[6] = saldoCierre2024[6] + resultadoEjercicio2025Negativo;

            aRows.push([
                { text: 'SALDO AL CIERRE DEL EJERCICIO ' + sEjActual, style: 'filaTitulo', margin: [0, 2, 0, 2] },
                { text: fmtOrDash(saldoCierre2025[0]), style: 'importeBold' },
                { text: fmtOrDash(saldoCierre2025[1]), style: 'importeBold' },
                { text: fmtOrDash(saldoCierre2025[2]), style: 'importeBold' },
                { text: fmtOrDash(saldoCierre2025[3]), style: 'importeBold' },
                { text: fmtOrDash(saldoCierre2025[4]), style: 'importeBold' },
                { text: fmtOrDash(saldoCierre2025[5]), style: 'importeBold' },
                { text: fmtOrDash(saldoCierre2025[6]), style: 'importeBold' }
            ]);

            return aRows;
        },

        _getSignatureBlock: function () {
            return {
                table: {
                    widths: ['*', 20, '*', 20, '*'],
                    body: [
                        [
                            { text: '____________________________', alignment: 'center', margin: [0, 20, 0, 5] },
                            {},
                            { text: '____________________________', alignment: 'center', margin: [0, 20, 0, 5] },
                            {},
                            { text: '____________________________', alignment: 'center', margin: [0, 20, 0, 5] }
                        ],
                        [
                            { text: 'REPRESENTANTE LEGAL', style: 'firmaTexto' },
                            {},
                            { text: 'REPRESENTANTE LEGAL (Socio)', style: 'firmaTexto' },
                            {},
                            { text: 'CONTADOR/A', style: 'firmaTexto' }
                        ]
                    ]
                },
                layout: 'noBorders'
            };
        }
    };

    return PdfExport;
});
