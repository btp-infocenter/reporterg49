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
    "sap/ui/core/CustomData"
], function (MessageToast, MessageBox, BusyDialog, Dialog, RadioButtonGroup, RadioButton, Button, VBox, Label, CustomData) {
    'use strict';

    var PDFMAKE_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/pdfmake.min.js";
    var PDFMAKE_FONTS_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/vfs_fonts.js";

    var fmt = function (v) {
        if (v === null || v === undefined || isNaN(v)) return "0";
        return Number(v).toLocaleString('es-PY', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    };

    // Formato especial para Flujo de Efectivo: paréntesis para negativos
    var fmtFlujo = function (v) {
        if (v === null || v === undefined || isNaN(v) || v === 0) return "-";
        var num = Number(v);
        if (num < 0) {
            return "(" + Math.abs(num).toLocaleString('es-PY', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ")";
        }
        return num.toLocaleString('es-PY', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
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

    // Configuración de MÁS/MENOS para Estado de Resultados (según Excel)
    var ESTADO_RESULTADOS_SEPARADORES = {
        "5": "MENOS:",
        "8": "MÁS:",
        "10": "MENOS:",
        "11": "MENOS:",
        "13": "MENOS:",
        "15": "MENOS:"
    };
    
    // Cuentas que son TOTALES CALCULADOS
    var CUENTAS_TOTALES_CALCULADOS = {
        "6": true,
        "9": true,
        "12": true,
        "16": true,
        "18": true,
        "20": true
    };

    // Cuentas que requieren valor absoluto - Estado de Resultados (Anexo 2)
    var CUENTAS_VALOR_ABSOLUTO_RESULTADOS = {
        "409": true,
        "412": true,
        "801": true,
        "803": true,
        "805": true,
        "806": true
    };

    // Cuentas que requieren valor absoluto - Balance General (Anexo 1)
    var CUENTAS_VALOR_ABSOLUTO_BALANCE = {
        "30101": true,
        "2010101": true,
        "2010102": true,
        "2010103": true,
        "2010104": true,
        "2010201": true,
        "2010202": true,
        "2010203": true,
        "2010204": true,
        "2010205": true,
        "2010206": true,
        "2010207": true,
        "201030101": true,
        "201030102": true,
        "201030103": true,
        "201030105": true,
        "2010302": true,
        "2010303": true,
        "2010304": true,
        "2010401": true,
        "2010402": true,
        "2010403": true,
        "2010501": true,
        "2020201": true,
        "2020202": true,
        "2020204": true,
        "2020205": true,
        "2020303": true,
        "1020000": true,
        "3010101": true,
        "3010102": true,
        "30201": true,
        "30202": true
    };

    // ============================================================
    // CONFIGURACIÓN DEL ANEXO 3 - ESTADO DE FLUJO DE EFECTIVO
    // ============================================================
    
    // Cuentas que son TÍTULOS de sección (fondo gris, sin valores)
    var FLUJO_CUENTAS_TITULO = {
        "8000": true,  // FLUJO DE EFECTIVO POR ACTIVIDADES OPERATIVAS
        "8008": true,  // FLUJO DE EFECTIVO POR ACTIVIDADES DE INVERSIÓN
        "8013": true   // FLUJO DE EFECTIVO POR ACTIVIDADES DE FINANCIAMIENTO
    };
    
    // Cuentas que se muestran como título (fondo gris) pero tienen valores como item
    // NO participan en ningún subtotal
    var FLUJO_CUENTAS_TITULO_CON_VALOR = {
        "8019": true   // EFECTO DE LAS GANANCIAS O PÉRDIDAS POR DIFERENCIAS DE TIPO DE CAMBIO
    };
    
    // Cuentas que son SUBTOTALES (fondo gris, suman items previos desde el título)
    var FLUJO_CUENTAS_SUBTOTAL = {
        "8007": { desde: 8001, hasta: 8006 },  // EFECTIVO NETO POR ACTIVIDADES OPERATIVAS
        "8012": { desde: 8009, hasta: 8011 },  // EFECTIVO NETO POR ACTIVIDADES DE INVERSIÓN
        "8018": { desde: 8014, hasta: 8017 },  // EFECTIVO NETO POR ACTIVIDADES DE FINANCIAMIENTO
        "8022": { desde: 8020, hasta: 8021 }   // EFECTIVO Y SUS EQUIVALENTES AL CIERRE DEL PERIODO
    };

    // ============================================================
    // CONFIGURACIÓN DEL ANEXO 4 - ESTADO DE CAMBIOS DEL PATRIMONIO
    // ============================================================
    
    // Mapeo de cuentas del Balance General a columnas del Patrimonio
    var PATRIMONIO_COLUMNAS_MAPEO = {
        "301": 0,
        "30101": 0,
        "302": 1,
        "30201": 1,
        "30202": 2,
        "30203": 3,
        "303": 4,
        "30301": 4,
        "30302": 5,
        "304": 5
    };

    // Filas del Estado de Cambios del Patrimonio
    var PATRIMONIO_FILAS = [
        { id: "saldo_inicio", texto: "SALDO AL INICIO DEL EJERCICIO {anio_anterior}", esTitulo: true },
        { id: "mov_titulo", texto: "MOVIMIENTOS DEL EJERCICIO {anio_anterior}", esTitulo: true, soloTexto: true },
        { id: "integracion_capital", texto: "INTEGRACIÓN DE CAPITAL", esMovimiento: true },
        { id: "transferencia_dividendos", texto: "TRANSFERENCIA A DIVIDENDOS A PAGAR", esMovimiento: true },
        { id: "ajustes_desafectac", texto: "AJUSTES/DESAFECTAC. DE RESULT. ACUMULADOS", esMovimiento: true },
        { id: "reserva_legal", texto: "RESERVA LEGAL", esMovimiento: true },
        { id: "reserva_revaluo", texto: "RESERVA DE REVALÚO", esMovimiento: true },
        { id: "otras_reservas", texto: "OTRAS RESERVAS", esMovimiento: true },
        { id: "resultado_ejercicio_ant", texto: "RESULTADO DEL EJERCICIO {anio_anterior}", esTitulo: true },
        { id: "saldo_cierre_ant", texto: "SALDO AL CIERRE DEL EJERCICIO {anio_anterior} = INICIO DEL EJERCICIO {anio_actual}", esTitulo: true },
        { id: "mov_titulo_actual", texto: "MOVIMIENTOS DEL EJERCICIO {anio_actual}", esTitulo: true, soloTexto: true },
        { id: "integracion_capital_act", texto: "INTEGRACIÓN DE CAPITAL", esMovimiento: true },
        { id: "transferencia_dividendos_act", texto: "TRANSFERENCIA A DIVIDENDOS A PAGAR", esMovimiento: true },
        { id: "ajustes_desafectac_act", texto: "AJUSTES/DESAFECTAC. DE RESULT. ACUMULADOS", esMovimiento: true },
        { id: "reserva_legal_act", texto: "RESERVA LEGAL", esMovimiento: true },
        { id: "reserva_revaluo_act", texto: "RESERVA DE REVALÚO", esMovimiento: true },
        { id: "otras_reservas_act", texto: "OTRAS RESERVAS", esMovimiento: true },
        { id: "resultado_ejercicio_act", texto: "RESULTADO DEL EJERCICIO {anio_actual}", esTitulo: true },
        { id: "saldo_cierre_act", texto: "SALDO AL CIERRE DEL EJERCICIO {anio_actual}", esTitulo: true }
    ];

    function readAllRows(oTable) {
        return new Promise(function (resolve, reject) {
            var oBinding = oTable.getBinding("rows") || oTable.getBinding("items");
            if (!oBinding) { console.error("No binding"); resolve([]); return; }
            var oModel = oBinding.getModel();
            var sPath = oBinding.getPath();
            var aFilters = [];
            if (oBinding.aApplicationFilters) aFilters = aFilters.concat(oBinding.aApplicationFilters);
            if (oBinding.aFilters) aFilters = aFilters.concat(oBinding.aFilters);
            var aSorters = oBinding.aSorters || [];

            oModel.read(sPath, {
                filters: aFilters, sorters: aSorters,
                urlParameters: { "$top": 5000, "$skip": 0 },
                success: function (oData) { resolve(oData.results || []); },
                error: function (oError) { reject(oError); }
            });
        });
    }

    function extraerFiltrosDeBinding(aFilters, oFilterData) {
        aFilters.forEach(function (oFilter) {
            if (oFilter.aFilters) {
                extraerFiltrosDeBinding(oFilter.aFilters, oFilterData);
            } else {
                var sPath = oFilter.sPath || (oFilter.getPath ? oFilter.getPath() : "");
                var sValue = oFilter.oValue1 || (oFilter.getValue1 ? oFilter.getValue1() : "");
                if (sPath === "Sociedad") oFilterData.sociedad = sValue;
                else if (sPath === "Ejercicio") oFilterData.ejercicio = sValue;
            }
        });
    }

    var PdfHelper = {
        _pdfMakeLoaded: false, _vfsFontsLoaded: false, _oView: null, _oSmartTable: null, _oFilterData: null,

        exportarPdf: function (oEvent) {
            var that = this;
            try {
                var oView = null;
                var oControl = oEvent.getSource();
                while (oControl && oControl.getParent) {
                    oControl = oControl.getParent();
                    if (oControl.isA && oControl.isA("sap.ui.core.mvc.View")) { oView = oControl; break; }
                }
                if (!oView) throw new Error("Vista no encontrada");

                var oSmartTable = null;
                var aAllControls = oView.findAggregatedObjects(true, function (oElem) {
                    return oElem.isA && oElem.isA("sap.ui.comp.smarttable.SmartTable");
                });
                if (aAllControls.length > 0) oSmartTable = aAllControls[0];
                if (!oSmartTable) throw new Error("SmartTable no encontrada");

                var oTable = oSmartTable.getTable();
                var oFilterData = { sociedad: "", ejercicio: "" };
                var oBinding = oTable.getBinding("rows") || oTable.getBinding("items");
                if (oBinding) {
                    var aFilters = [];
                    if (oBinding.aApplicationFilters) aFilters = aFilters.concat(oBinding.aApplicationFilters);
                    if (oBinding.aFilters) aFilters = aFilters.concat(oBinding.aFilters);
                    extraerFiltrosDeBinding(aFilters, oFilterData);
                }

                if (!oFilterData.sociedad || !oFilterData.ejercicio) {
                    MessageBox.warning("Seleccione Sociedad y Ejercicio.");
                    return;
                }

                that._oView = oView; that._oSmartTable = oSmartTable; that._oFilterData = oFilterData;
                that._mostrarDialogoSeleccion();
            } catch (error) { console.error(error); MessageBox.error(error.message); }
        },

        _mostrarDialogoSeleccion: function () {
            var that = this;
            var oRadioGroup = new RadioButtonGroup({
                columns: 1, selectedIndex: 0,
                buttons: [
                    new RadioButton({ text: "Anexo 1 - Balance General", customData: [new CustomData({ key: "anexo", value: "1" })] }),
                    new RadioButton({ text: "Anexo 2 - Estado de Resultados", customData: [new CustomData({ key: "anexo", value: "2" })] }),
                    new RadioButton({ text: "Anexo 3 - Estado de Flujo de Efectivo", customData: [new CustomData({ key: "anexo", value: "3" })] }),
                    new RadioButton({ text: "Anexo 4 - Estado de Cambios del Patrimonio Neto", customData: [new CustomData({ key: "anexo", value: "4" })] })
                ]
            });

            var oDialog = new Dialog({
                title: "Reporte RG49", content: new VBox({ items: [new Label({ text: "Seleccione reporte:", design: "Bold" }).addStyleClass("sapUiSmallMarginBottom"), oRadioGroup] }).addStyleClass("sapUiSmallMargin"),
                beginButton: new Button({ text: "Generar PDF", type: "Emphasized", press: function () {
                    var iIndex = oRadioGroup.getSelectedIndex();
                    var sAnexo = oRadioGroup.getButtons()[iIndex].getCustomData()[0].getValue();
                    oDialog.close(); that._generarPDFConAnexo(sAnexo);
                }}),
                endButton: new Button({ text: "Cancelar", press: function () { oDialog.close(); } }),
                afterClose: function () { oDialog.destroy(); }
            });
            oDialog.open();
        },

        _generarPDFConAnexo: async function (sAnexo) {
            var that = this;
            oBusyDialog.open();
            try {
                var oTable = that._oSmartTable.getTable();
                var aTableData = await readAllRows(oTable);
                if (!aTableData || aTableData.length === 0) { oBusyDialog.close(); MessageBox.warning("Sin datos."); return; }

                var oAnexoConfig = ANEXOS_CONFIG[sAnexo];
                
                var aDataProcesada;
                if (oAnexoConfig.tipo === "patrimonio") {
                    aDataProcesada = that._procesarDatosParaPatrimonio(aTableData);
                } else if (oAnexoConfig.tipo === "flujo") {
                    aDataProcesada = that._procesarDatosParaFlujoEfectivo(aTableData, oAnexoConfig);
                } else {
                    aDataProcesada = that._procesarDatosParaAnexo(aTableData, oAnexoConfig);
                }
                
                if (aDataProcesada.length === 0) { oBusyDialog.close(); MessageBox.warning("Sin datos para este Anexo."); return; }

                // Calcular totales (excepto para patrimonio y flujo que tienen lógica diferente)
                if (oAnexoConfig.tipo !== "patrimonio" && oAnexoConfig.tipo !== "flujo") {
                    aDataProcesada = that._calcularTotalesPadres(aDataProcesada);
                }

                await that._loadPdfMake();
                if (window.pdfMake && window.pdfFonts && window.pdfFonts.pdfMake) { window.pdfMake.vfs = window.pdfFonts.pdfMake.vfs; }

                var oHeaderData = that._obtenerDatosHeader(aTableData);
                var docDefinition;
                
                if (oAnexoConfig.tipo === "patrimonio") {
                    docDefinition = that._crearDefinicionPDFPatrimonio(oHeaderData, aDataProcesada, that._oFilterData, oAnexoConfig);
                } else if (oAnexoConfig.tipo === "flujo") {
                    docDefinition = that._crearDefinicionPDFFlujoEfectivo(oHeaderData, aDataProcesada, that._oFilterData, oAnexoConfig);
                } else {
                    docDefinition = that._crearDefinicionPDF(oHeaderData, aDataProcesada, that._oFilterData, oAnexoConfig);
                }
                
                var sFileName = oAnexoConfig.nombreArchivo + "_" + that._oFilterData.sociedad + ".pdf";

                // Generar PDF y mostrar preview en Dialog integrado
                var pdfDoc = pdfMake.createPdf(docDefinition);
                
                pdfDoc.getBlob(function(blob) {
                    var sUrl = URL.createObjectURL(blob);
                    
                    // Crear ID único para el contenedor
                    var sContainerId = "pdfContainer_" + Date.now();
                    
                    // Usar HTML control con iframe para mostrar el PDF
                    // El contenedor div asegura que el iframe tome todo el espacio
                    var oHtmlContent = new sap.ui.core.HTML({
                        content: '<div id="' + sContainerId + '" style="width:100%; height:100%; position:absolute; top:0; left:0; right:0; bottom:0;">' +
                                 '<iframe src="' + sUrl + '#toolbar=1&navpanes=1" ' +
                                 'style="width:100%; height:100%; border:none; display:block;" ' +
                                 'type="application/pdf" ' +
                                 'title="Vista previa PDF"></iframe>' +
                                 '</div>',
                        preferDOM: true
                    });
                    
                    // Crear Dialog contenedor estilo Fiori
                    var oPreviewDialog = new Dialog({
                        title: oAnexoConfig.titulo + " - " + oAnexoConfig.subtitulo,
                        contentWidth: "90%",
                        contentHeight: "85%",
                        stretch: sap.ui.Device.system.phone,
                        resizable: true,
                        draggable: true,
                        verticalScrolling: false,
                        horizontalScrolling: false,
                        content: [oHtmlContent],
                        buttons: [
                            new Button({
                                text: "Descargar",
                                type: "Emphasized",
                                icon: "sap-icon://download",
                                press: function() {
                                    // Descargar usando el blob original
                                    var link = document.createElement('a');
                                    link.href = sUrl;
                                    link.download = sFileName;
                                    document.body.appendChild(link);
                                    link.click();
                                    document.body.removeChild(link);
                                    MessageToast.show("Descargando " + sFileName);
                                }
                            }),
                            new Button({
                                text: "Cerrar",
                                press: function() {
                                    oPreviewDialog.close();
                                }
                            })
                        ],
                        afterClose: function() {
                            // Limpiar recursos
                            URL.revokeObjectURL(sUrl);
                            oHtmlContent.destroy();
                            oPreviewDialog.destroy();
                        }
                    });
                    
                    // Agregar clase CSS para que el contenido ocupe todo el espacio
                    oPreviewDialog.addStyleClass("sapUiNoContentPadding");
                    
                    oPreviewDialog.open();
                    oBusyDialog.close();
                    MessageToast.show("PDF generado.");
                });
                
                return; // Salir aquí, el cierre del BusyDialog se maneja en el callback
            } catch (error) { console.error(error); MessageBox.error(error.message); oBusyDialog.close(); }
        },

        /**
         * Procesa datos: filtra por anexo y AGREGA duplicados sumando importes
         */
        _procesarDatosParaAnexo: function (aData, oAnexoConfig) {
            var that = this;
            var oAggregatedMap = {};

            aData.forEach(function (oRow) {
                var sCuenta = (oRow.CuentaRG49 || "").toString();
                var iCuentaPrincipal = that._obtenerCuentaPrincipal(sCuenta);
                
                if (iCuentaPrincipal >= oAnexoConfig.cuentasDesde && iCuentaPrincipal <= oAnexoConfig.cuentasHasta) {
                    var sKey = sCuenta;
                    var v1 = parseFloat(oRow.Importe2025) || 0;
                    var v2 = parseFloat(oRow.ImporteAoAnteriorNuevo_V) || 0;
                    
                    // Aplicar valor absoluto según el tipo de anexo
                    if (oAnexoConfig.tipo === "resultados" && CUENTAS_VALOR_ABSOLUTO_RESULTADOS[sCuenta]) {
                        v1 = Math.abs(v1);
                        v2 = Math.abs(v2);
                    } else if (oAnexoConfig.tipo === "balance" && CUENTAS_VALOR_ABSOLUTO_BALANCE[sCuenta]) {
                        v1 = Math.abs(v1);
                        v2 = Math.abs(v2);
                    }
                    
                    if (!oAggregatedMap[sKey]) {
                        oAggregatedMap[sKey] = {
                            CuentaRG49: oRow.CuentaRG49,
                            DescripcinCuentaRG49: oRow.DescripcinCuentaRG49 || oRow.SAP_Description_1,
                            SAP_Description_1: oRow.SAP_Description_1,
                            Orden: oRow.Orden,
                            Importe2025: v1,
                            ImporteAoAnteriorNuevo_V: v2,
                            RaznSocial: oRow.RaznSocial,
                            SAP_Description: oRow.SAP_Description,
                            RucEmpresa: oRow.RucEmpresa,
                            RepresentanteLegal: oRow.RepresentanteLegal,
                            Contador: oRow.Contador,
                            RUCContador: oRow.RUCContador,
                            Field012: oRow.Field012,
                            Field013: oRow.Field013
                        };
                    } else {
                        oAggregatedMap[sKey].Importe2025 += v1;
                        oAggregatedMap[sKey].ImporteAoAnteriorNuevo_V += v2;
                    }
                }
            });

            var aSorted = Object.values(oAggregatedMap).sort(function (a, b) { 
                return parseInt(a.Orden || 0) - parseInt(b.Orden || 0); 
            });
            
            return aSorted;
        },

        /**
         * Procesa datos para Anexo 3 (Flujo de Efectivo)
         * - Filtra cuentas 8000-8022
         * - Para año anterior: usa ImporteAoAnteriorNuevo_V directo
         * - Para año vigente: agrupa por UbicacionFlujo y suma Importe2025
         * - Calcula subtotales para cuentas 8007, 8012, 8018, 8022
         */
        _procesarDatosParaFlujoEfectivo: function (aData, oAnexoConfig) {
            var that = this;
            
            // Paso 1: Crear mapa de cuentas del flujo (8000-8022) con sus descripciones
            var oCuentasFlujoMap = {};
            
            aData.forEach(function (oRow) {
                var sCuenta = (oRow.CuentaRG49 || "").toString();
                var iCuenta = parseInt(sCuenta, 10);
                
                // Solo cuentas del flujo de efectivo (8000-8022)
                if (iCuenta >= 8000 && iCuenta <= 8022) {
                    if (!oCuentasFlujoMap[sCuenta]) {
                        oCuentasFlujoMap[sCuenta] = {
                            CuentaRG49: sCuenta,
                            DescripcinCuentaRG49: oRow.DescripcinCuentaRG49 || oRow.SAP_Description_1 || "",
                            Orden: oRow.Orden || iCuenta,
                            ImporteAnterior: 0,
                            ImporteVigente: 0,
                            UbicFlujo: oRow.UbicFlujo || "",
                            RaznSocial: oRow.RaznSocial,
                            SAP_Description: oRow.SAP_Description,
                            RucEmpresa: oRow.RucEmpresa,
                            RepresentanteLegal: oRow.RepresentanteLegal,
                            Contador: oRow.Contador,
                            RUCContador: oRow.RUCContador,
                            Field012: oRow.Field012,
                            Field013: oRow.Field013
                        };
                    }
                    // Sumar importe año anterior para la cuenta
                    oCuentasFlujoMap[sCuenta].ImporteAnterior += parseFloat(oRow.ImporteAoAnteriorNuevo_V) || 0;
                }
            });
            
            // Paso 2: Para el año vigente, agrupar por UbicacionFlujo
            // Crear mapa de UbicacionFlujo -> suma de Importe2025
            var oUbicacionFlujoMap = {};
            
            aData.forEach(function (oRow) {
                var sUbicacion = (oRow.UbicFlujo || "").toString().trim();
                if (sUbicacion) {
                    var vImporte = parseFloat(oRow.Importe2025) || 0;
                    if (!oUbicacionFlujoMap[sUbicacion]) {
                        oUbicacionFlujoMap[sUbicacion] = 0;
                    }
                    oUbicacionFlujoMap[sUbicacion] += vImporte;
                }
            });
            
            console.log("=== DEBUG FLUJO EFECTIVO ===");
            console.log("Cuentas flujo encontradas:", Object.keys(oCuentasFlujoMap));
            console.log("Ubicaciones flujo con valores:", oUbicacionFlujoMap);
            
            // Paso 3: Asignar valores del año vigente a cada cuenta según su UbicFlujo
            // Incluye cuentas normales y TITULO_CON_VALOR (8019), excluye títulos puros y subtotales
            Object.keys(oCuentasFlujoMap).forEach(function (sCuenta) {
                var oCuenta = oCuentasFlujoMap[sCuenta];
                var sUbicacion = oCuenta.UbicFlujo;
                
                // Solo asignar si no es título puro ni subtotal
                if (!FLUJO_CUENTAS_TITULO[sCuenta] && !FLUJO_CUENTAS_SUBTOTAL[sCuenta]) {
                    if (sUbicacion && oUbicacionFlujoMap[sUbicacion] !== undefined) {
                        oCuenta.ImporteVigente = oUbicacionFlujoMap[sUbicacion];
                    }
                }
            });
            
            // Paso 4: Calcular subtotales
            // Excluye cuentas TITULO_CON_VALOR (8019) que no participan en ningún subtotal
            Object.keys(FLUJO_CUENTAS_SUBTOTAL).forEach(function (sSubtotal) {
                var oConfig = FLUJO_CUENTAS_SUBTOTAL[sSubtotal];
                var fSumaVigente = 0;
                var fSumaAnterior = 0;
                
                for (var i = oConfig.desde; i <= oConfig.hasta; i++) {
                    var sCuentaItem = i.toString();
                    // Excluir cuentas que son TITULO_CON_VALOR (no participan en subtotales)
                    if (oCuentasFlujoMap[sCuentaItem] && !FLUJO_CUENTAS_TITULO_CON_VALOR[sCuentaItem]) {
                        fSumaVigente += oCuentasFlujoMap[sCuentaItem].ImporteVigente;
                        fSumaAnterior += oCuentasFlujoMap[sCuentaItem].ImporteAnterior;
                    }
                }
                
                if (oCuentasFlujoMap[sSubtotal]) {
                    oCuentasFlujoMap[sSubtotal].ImporteVigente = fSumaVigente;
                    oCuentasFlujoMap[sSubtotal].ImporteAnterior = fSumaAnterior;
                }
            });
            
            console.log("Cuentas flujo procesadas:", oCuentasFlujoMap);
            console.log("=== FIN DEBUG FLUJO EFECTIVO ===");
            
            // Paso 5: Convertir a array y ordenar por número de cuenta
            var aSorted = Object.values(oCuentasFlujoMap).sort(function (a, b) {
                return parseInt(a.CuentaRG49 || 0) - parseInt(b.CuentaRG49 || 0);
            });
            
            return aSorted;
        },

        /**
         * Procesa datos para Anexo 4 (Patrimonio)
         */
        _procesarDatosParaPatrimonio: function (aData) {
            var that = this;
            var oAggregatedMap = {};

            aData.forEach(function (oRow) {
                var sCuenta = (oRow.CuentaRG49 || "").toString();
                
                if (sCuenta.charAt(0) === '3') {
                    var sKey = sCuenta;
                    var v1 = parseFloat(oRow.Importe2025) || 0;
                    var v2 = parseFloat(oRow.ImporteAoAnteriorNuevo_V) || 0;
                    
                    if (!oAggregatedMap[sKey]) {
                        oAggregatedMap[sKey] = {
                            CuentaRG49: oRow.CuentaRG49,
                            DescripcinCuentaRG49: oRow.DescripcinCuentaRG49 || oRow.SAP_Description_1,
                            SAP_Description_1: oRow.SAP_Description_1,
                            Orden: oRow.Orden,
                            Importe2025: v1,
                            ImporteAoAnteriorNuevo_V: v2,
                            RaznSocial: oRow.RaznSocial,
                            SAP_Description: oRow.SAP_Description,
                            RucEmpresa: oRow.RucEmpresa,
                            RepresentanteLegal: oRow.RepresentanteLegal,
                            Contador: oRow.Contador,
                            RUCContador: oRow.RUCContador,
                            Field012: oRow.Field012,
                            Field013: oRow.Field013
                        };
                    } else {
                        oAggregatedMap[sKey].Importe2025 += v1;
                        oAggregatedMap[sKey].ImporteAoAnteriorNuevo_V += v2;
                    }
                }
            });

            var aSorted = Object.values(oAggregatedMap).sort(function (a, b) { 
                return parseInt(a.Orden || 0) - parseInt(b.Orden || 0); 
            });
            
            return aSorted;
        },

        _obtenerCuentaPrincipal: function (sCuenta) {
            if (!sCuenta) return 0;
            var sCuentaStr = sCuenta.toString();
            
            if (sCuentaStr.length % 2 === 0) {
                return parseInt(sCuentaStr.substring(0, 2), 10);
            } else {
                return parseInt(sCuentaStr.charAt(0), 10);
            }
        },

        _formatearCuenta: function (sCuenta) {
            if (!sCuenta) return "";
            if (sCuenta.indexOf('.') > -1) return sCuenta;
            
            var sCuentaStr = sCuenta.toString();
            if (sCuentaStr.length <= 1) return sCuentaStr;
            
            var aPartes = [];
            var sResto;
            
            if (sCuentaStr.length % 2 === 0) {
                aPartes.push(sCuentaStr.substring(0, 2));
                sResto = sCuentaStr.substring(2);
            } else {
                aPartes.push(sCuentaStr.charAt(0));
                sResto = sCuentaStr.substring(1);
            }
            
            while (sResto.length > 0) {
                aPartes.push(sResto.substring(0, 2));
                sResto = sResto.substring(2);
            }
            
            return aPartes.join('.');
        },

        _calcularTotalesPadres: function (aData) {
            var that = this;
            var oCuentasMap = {};

            aData.forEach(function (oRow) {
                var sFmt = that._formatearCuenta(oRow.CuentaRG49 || "");
                var iCuentaPrincipal = that._obtenerCuentaPrincipal((oRow.CuentaRG49 || "").toString());
                oCuentasMap[sFmt] = { 
                    data: oRow, 
                    imp25: parseFloat(oRow.Importe2025) || 0, 
                    imp24: parseFloat(oRow.ImporteAoAnteriorNuevo_V) || 0,
                    cuentaRaw: (oRow.CuentaRG49 || "").toString(),
                    cuentaPrincipal: iCuentaPrincipal
                };
            });

            var keys = Object.keys(oCuentasMap).sort(function(a, b) { 
                return b.split('.').length - a.split('.').length; 
            });

            keys.forEach(function(sChildKey) {
                var oChild = oCuentasMap[sChildKey];
                var parts = sChildKey.split('.');
                
                while (parts.length > 1) {
                    parts.pop();
                    var sParentKey = parts.join('.');
                    
                    if (oCuentasMap[sParentKey]) {
                        var oParent = oCuentasMap[sParentKey];
                        
                        if (CUENTAS_TOTALES_CALCULADOS[oParent.cuentaPrincipal.toString()]) {
                            break;
                        }
                        
                        oParent.imp25 += oChild.imp25;
                        oParent.imp24 += oChild.imp24;
                        
                        oParent.data.Importe2025 = oParent.imp25;
                        oParent.data.ImporteAoAnteriorNuevo_V = oParent.imp24;
                        
                        break;
                    }
                }
            });

            var getCuentaValor = function(iCuenta, campo) {
                var sCuenta = iCuenta.toString();
                if (oCuentasMap[sCuenta]) {
                    return campo === '25' ? oCuentasMap[sCuenta].imp25 : oCuentasMap[sCuenta].imp24;
                }
                return 0;
            };
            
            var setCuentaValor = function(iCuenta, val25, val24) {
                var sCuenta = iCuenta.toString();
                if (oCuentasMap[sCuenta]) {
                    oCuentasMap[sCuenta].imp25 = val25;
                    oCuentasMap[sCuenta].imp24 = val24;
                    oCuentasMap[sCuenta].data.Importe2025 = val25;
                    oCuentasMap[sCuenta].data.ImporteAoAnteriorNuevo_V = val24;
                }
            };

            // Cálculos para Estado de Resultados
            var v6_25 = getCuentaValor(4, '25') - getCuentaValor(5, '25');
            var v6_24 = getCuentaValor(4, '24') - getCuentaValor(5, '24');
            setCuentaValor(6, v6_25, v6_24);

            var v9_25 = v6_25 + getCuentaValor(8, '25');
            var v9_24 = v6_24 + getCuentaValor(8, '24');
            setCuentaValor(9, v9_25, v9_24);

            var v12_25 = v9_25 - getCuentaValor(10, '25') - getCuentaValor(11, '25');
            var v12_24 = v9_24 - getCuentaValor(10, '24') - getCuentaValor(11, '24');
            setCuentaValor(12, v12_25, v12_24);

            var v16_25 = v12_25 - getCuentaValor(13, '25') - getCuentaValor(15, '25');
            var v16_24 = v12_24 - getCuentaValor(13, '24') - getCuentaValor(15, '24');
            setCuentaValor(16, v16_25, v16_24);

            var v18_25 = v16_25 + getCuentaValor(17, '25');
            var v18_24 = v16_24 + getCuentaValor(17, '24');
            setCuentaValor(18, v18_25, v18_24);

            var v20_25 = v18_25 - getCuentaValor(19, '25');
            var v20_24 = v18_24 - getCuentaValor(19, '24');
            setCuentaValor(20, v20_25, v20_24);

            // Cálculo especial para cuenta 3 (PATRIMONIO NETO)
            if (oCuentasMap["3"]) {
                var cuenta301_25 = oCuentasMap["3.01"] ? oCuentasMap["3.01"].imp25 : 0;
                var cuenta303_25 = oCuentasMap["3.03"] ? oCuentasMap["3.03"].imp25 : 0;
                var patrimonio2025 = cuenta303_25 - cuenta301_25;
                
                oCuentasMap["3"].imp25 = patrimonio2025;
                oCuentasMap["3"].data.Importe2025 = patrimonio2025;
            }

            return aData;
        },

        _loadPdfMake: function () {
            return new Promise(function (resolve, reject) {
                if (PdfHelper._pdfMakeLoaded) { resolve(); return; }
                PdfHelper._loadScript("pdfmake", PDFMAKE_URL).then(function(){
                    PdfHelper._pdfMakeLoaded = true;
                    return PdfHelper._loadScript("vfs_fonts", PDFMAKE_FONTS_URL);
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

        _obtenerDatosHeader: function (aData) {
            var o = aData[0] || {};
            return {
                razonSocial: o.RaznSocial || o.SAP_Description || "",
                rucEmpresa: o.RucEmpresa || "",
                representanteLegal: o.RepresentanteLegal || "",
                contador: o.Contador || "",
                rucContador: o.RUCContador || "",
                auditor: o.Field012 || "",
                rucAuditor: o.Field013 || ""
            };
        },

        // ============================================================
        // DEFINICIÓN PDF PARA ANEXO 3 - ESTADO DE FLUJO DE EFECTIVO
        // ============================================================
        _crearDefinicionPDFFlujoEfectivo: function (oHeader, aData, oFilterData, oAnexoConfig) {
            var that = this;
            var sEj = oFilterData.ejercicio;
            var sEjAnt = (parseInt(sEj) - 1).toString();
            var sDesde = "01/01/" + sEj;
            var sHasta = "31/12/" + sEj;

            var firmaBlock = that._getSignatureBlock(oHeader);

            var buildHeader = function() {
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

            var aFilasTabla = that._crearFilasTablaFlujoEfectivo(aData, sEj, sEjAnt);

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
            var that = this;
            var aRows = [];
            
            // Header de columnas
            aRows.push([
                { text: '', style: 'headerColumna' },
                { text: sActual, style: 'headerColumna' },
                { text: sAnterior, style: 'headerColumna' }
            ]);

            aData.forEach(function (oRow) {
                var sCuenta = (oRow.CuentaRG49 || "").toString();
                var sDescripcion = oRow.DescripcinCuentaRG49 || "";
                var fValVigente = oRow.ImporteVigente || 0;
                var fValAnterior = oRow.ImporteAnterior || 0;

                var esTitulo = FLUJO_CUENTAS_TITULO[sCuenta];
                var esTituloConValor = FLUJO_CUENTAS_TITULO_CON_VALOR[sCuenta];
                var esSubtotal = FLUJO_CUENTAS_SUBTOTAL[sCuenta];

                if (esTitulo) {
                    // Fila de TÍTULO (fondo gris, sin valores en columnas de importe)
                    aRows.push([
                        { text: sDescripcion.toUpperCase(), style: 'flujoTitulo', margin: [0, 4, 0, 4] },
                        { text: '', style: 'flujoTitulo' },
                        { text: '', style: 'flujoTitulo' }
                    ]);
                } else if (esTituloConValor) {
                    // Fila de TÍTULO CON VALOR (fondo gris, CON valores - no participa en subtotales)
                    aRows.push([
                        { text: sDescripcion.toUpperCase(), style: 'flujoTitulo', margin: [0, 4, 0, 4] },
                        { text: fmtFlujo(fValVigente), style: 'importeBold', fillColor: '#e8e8e8', margin: [0, 4, 0, 4] },
                        { text: fmtFlujo(fValAnterior), style: 'importeBold', fillColor: '#e8e8e8', margin: [0, 4, 0, 4] }
                    ]);
                } else if (esSubtotal) {
                    // Fila de SUBTOTAL (fondo gris, con valores calculados, centrado vertical)
                    aRows.push([
                        { text: sDescripcion.toUpperCase(), style: 'flujoSubtotal', margin: [0, 4, 0, 4] },
                        { text: fmtFlujo(fValVigente), style: 'importeBold', fillColor: '#e8e8e8', margin: [0, 4, 0, 4] },
                        { text: fmtFlujo(fValAnterior), style: 'importeBold', fillColor: '#e8e8e8', margin: [0, 4, 0, 4] }
                    ]);
                } else {
                    // Fila de ITEM normal
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
            var that = this;
            var sEj = oFilterData.ejercicio;
            var sEjAnt = (parseInt(sEj) - 1).toString();
            var sDesde = "01/01/" + sEj;
            var sHasta = "31/12/" + sEj;

            var oPatrimonioData = that._extraerDatosPatrimonio(aData, sEj, sEjAnt);
            var aFilasTabla = that._crearFilasTablaPatrimonio(oPatrimonioData, sEj, sEjAnt);

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
                            vLineWidth: function (i, node) { return (i === 0 || i === node.table.widths.length) ? 0.5 : 0.3; },
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

        _extraerDatosPatrimonio: function (aData, sEjActual, sEjAnterior) {
            var that = this;
            
            var oCuentasMap = {};
            aData.forEach(function(oRow) {
                var sCuenta = (oRow.CuentaRG49 || "").toString().replace(/\./g, '');
                oCuentasMap[sCuenta] = {
                    descripcion: oRow.DescripcinCuentaRG49 || oRow.SAP_Description_1 || "",
                    importeActual: parseFloat(oRow.Importe2025) || 0,
                    importeAnterior: parseFloat(oRow.ImporteAoAnteriorNuevo_V) || 0
                };
            });

            var getValor = function(sCuenta, campo) {
                if (oCuentasMap[sCuenta]) {
                    return campo === 'actual' ? oCuentasMap[sCuenta].importeActual : oCuentasMap[sCuenta].importeAnterior;
                }
                return 0;
            };

            var oPatrimonio = {
                capitalIntegrado_2024: getValor("30101", "anterior"),
                resultadoAcumulado_2024: getValor("30", "anterior"),
                resultadoEjercicioInicio_2024: getValor("31", "anterior"),
                transferenciaDividendos_2024: getValor("33", "anterior"),
                resultadoEjercicio_2024: getValor("30302", "anterior"),
                transferenciaResultados_2025: getValor("30302", "anterior"),
                resultadoEjercicio_2025: getValor("30302", "actual")
            };

            return oPatrimonio;
        },

        _crearFilasTablaPatrimonio: function (oPatrimonio, sEjActual, sEjAnterior) {
            var aRows = [];
            
            var fmtOrDash = function(v) {
                if (v === 0 || v === null || v === undefined || isNaN(v)) return '-';
                return fmt(v);
            };
            
            var fmtOrEmpty = function(v) {
                if (v === 0 || v === null || v === undefined || isNaN(v)) return '';
                return fmt(v);
            };
            
            aRows.push([
                { text: '', style: 'headerColumnaTop', rowSpan: 2 },
                { text: 'CAPITAL', style: 'headerColumnaTop' },
                { text: 'RESERVAS', style: 'headerColumnaTop', colSpan: 3, alignment: 'center' },
                {}, {},
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

            var saldoInicio2024 = [
                oPatrimonio.capitalIntegrado_2024,
                0,
                0,
                0,
                oPatrimonio.resultadoAcumulado_2024,
                oPatrimonio.resultadoEjercicioInicio_2024,
                0
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

            var crearFilaMovimientoVacio = function(sTexto) {
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

            var resultadoEjercicio2024 = oPatrimonio.resultadoEjercicio_2024;
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

            var saldoCierre2024 = [
                saldoInicio2024[0],
                0,
                0,
                0,
                saldoInicio2024[4] + transferenciaDividendos2024,
                resultadoEjercicio2024,
                0
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
            
            var transferenciaResultados2025 = oPatrimonio.transferenciaResultados_2025;
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

            var saldoCierre2025 = [
                saldoInicio2024[0],
                0,
                0,
                0,
                saldoCierre2024[4] + transferenciaResultados2025,
                resultadoEjercicio2025Negativo,
                0
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

        _crearDefinicionPDF: function (oHeader, aData, oFilterData, oAnexoConfig) {
            var that = this;
            var sEj = oFilterData.ejercicio;
            var sEjAnt = (parseInt(sEj) - 1).toString();
            var sDesde = "01/01/" + sEj;
            var sHasta = "31/12/" + sEj;

            var firmaBlock = that._getSignatureBlock(oHeader);

            var buildHeader = function() {
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

            var aFilasTabla;
            if (oAnexoConfig.tipo === "resultados") {
                aFilasTabla = that._crearFilasTablaResultados(aData, sEj, sEjAnt);
            } else {
                aFilasTabla = that._crearFilasTablaBalance(aData, sEj, sEjAnt);
            }

            return {
                pageSize: 'LEGAL',
                pageOrientation: 'portrait',
                pageMargins: [30, 210, 30, 40],

                header: function () { return buildHeader(); },

                content: [
                    {
                        table: {
                            headerRows: 1, dontBreakRows: true, keepWithHeaderRows: 1,
                            widths: [55, '*', 70, 70],
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
                            paddingLeft: function (i) { return 4; },
                            paddingRight: function (i) { return 4; },
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
                    nivel1: { fontSize: 8, bold: true },
                    nivel2: { fontSize: 8, bold: true },
                    nivel3: { fontSize: 8, bold: true },
                    nivel4: { fontSize: 7.5 },
                    nivel5: { fontSize: 7.5 },
                    nivel6: { fontSize: 7 },
                    erNivel1: { fontSize: 8, bold: true },
                    erNivel2: { fontSize: 8 },
                    erNivel3: { fontSize: 7.5 },
                    erNivel4: { fontSize: 7.5 },
                    separador: { fontSize: 8, bold: true, decoration: 'underline' },
                    importeBold: { fontSize: 8, bold: true, alignment: 'right' },
                    importeNormal: { fontSize: 7.5, alignment: 'right' },
                    firmaTexto: { fontSize: 8, alignment: 'center', bold: true }
                },
                defaultStyle: { font: 'Roboto' }
            };
        },

        _crearFilasTablaBalance: function (aData, sActual, sAnterior) {
            var that = this;
            var aRows = [];
            
            aRows.push([
                { text: '', style: 'headerColumna' },
                { text: '', style: 'headerColumna' },
                { text: sActual, style: 'headerColumna' },
                { text: sAnterior, style: 'headerColumna' }
            ]);

            var iPrevLevel = 0;

            aData.forEach(function (oRow, index) {
                var sCuenta = that._formatearCuenta(oRow.CuentaRG49 || "");
                var sDescripcion = oRow.DescripcinCuentaRG49 || oRow.SAP_Description_1 || "";
                var fVal1 = parseFloat(oRow.Importe2025) || 0;
                var fVal2 = parseFloat(oRow.ImporteAoAnteriorNuevo_V) || 0;

                var iLevel = sCuenta.split('.').length;
                var styleDesc = 'nivel4';
                var styleImp = 'importeNormal';
                var marginL = 18;
                var marginTop = 1;

                if (index > 0) {
                    if (iLevel === 1) marginTop = 12;
                    else if (iLevel === 2 && iPrevLevel !== 1) marginTop = 8;
                    else if (iLevel === 3 && iPrevLevel > 3) marginTop = 5;
                }

                if (iLevel === 1) { 
                    styleDesc = 'nivel1'; styleImp = 'importeBold'; marginL = 0; 
                } else if (iLevel === 2) { 
                    styleDesc = 'nivel2'; styleImp = 'importeBold'; marginL = 5; 
                } else if (iLevel === 3) { 
                    styleDesc = 'nivel3'; styleImp = 'importeBold'; marginL = 10; 
                } else if (iLevel === 4) { 
                    styleDesc = 'nivel4'; styleImp = 'importeNormal'; marginL = 15; 
                } else if (iLevel === 5) { 
                    styleDesc = 'nivel5'; styleImp = 'importeNormal'; marginL = 20; 
                } else { 
                    styleDesc = 'nivel6'; styleImp = 'importeNormal'; marginL = 25; 
                }

                aRows.push([
                    { text: sCuenta, style: styleDesc, margin: [0, marginTop, 0, 1] },
                    { text: sDescripcion, style: styleDesc, margin: [marginL, marginTop, 0, 1] },
                    { text: fmt(fVal1), style: styleImp, margin: [0, marginTop, 0, 1] },
                    { text: fmt(fVal2), style: styleImp, margin: [0, marginTop, 0, 1] }
                ]);
                iPrevLevel = iLevel;
            });
            return aRows;
        },

        _crearFilasTablaResultados: function (aData, sActual, sAnterior) {
            var that = this;
            var aRows = [];
            
            aRows.push([
                { text: '', style: 'headerColumna' },
                { text: '', style: 'headerColumna' },
                { text: sActual, style: 'headerColumna' },
                { text: sAnterior, style: 'headerColumna' }
            ]);

            aData.forEach(function (oRow, index) {
                var sCuentaRaw = (oRow.CuentaRG49 || "").toString();
                var sCuenta = that._formatearCuenta(sCuentaRaw);
                var sDescripcion = oRow.DescripcinCuentaRG49 || oRow.SAP_Description_1 || "";
                var fVal1 = parseFloat(oRow.Importe2025) || 0;
                var fVal2 = parseFloat(oRow.ImporteAoAnteriorNuevo_V) || 0;

                var iLevel = sCuenta.split('.').length;
                var iCuentaPrincipal = that._obtenerCuentaPrincipal(sCuentaRaw);
                var sCuentaPrincipalStr = iCuentaPrincipal.toString();
                
                if (iLevel === 1 && ESTADO_RESULTADOS_SEPARADORES[sCuentaPrincipalStr]) {
                    var sSeparador = ESTADO_RESULTADOS_SEPARADORES[sCuentaPrincipalStr];
                    aRows.push([
                        { text: '', margin: [0, 10, 0, 2] },
                        { text: sSeparador, style: 'separador', margin: [0, 10, 0, 2] },
                        { text: '', margin: [0, 10, 0, 2] },
                        { text: '', margin: [0, 10, 0, 2] }
                    ]);
                }

                var styleDesc = 'erNivel3';
                var styleImp = 'importeNormal';
                var marginL = 10;
                var marginTop = 2;
                var marginBottom = 1;

                if (iLevel === 1) {
                    styleDesc = 'erNivel1';
                    styleImp = 'importeBold';
                    marginL = 0;
                    marginTop = 4;
                } else if (iLevel === 2) {
                    styleDesc = 'erNivel2';
                    marginL = 5;
                } else if (iLevel === 3) {
                    styleDesc = 'erNivel3';
                    marginL = 10;
                } else {
                    styleDesc = 'erNivel4';
                    marginL = 15;
                }

                if (CUENTAS_TOTALES_CALCULADOS[sCuentaPrincipalStr]) {
                    marginTop = 10;
                    marginBottom = 10;
                }

                aRows.push([
                    { text: sCuenta, style: styleDesc, margin: [0, marginTop, 0, marginBottom] },
                    { text: sDescripcion, style: styleDesc, margin: [marginL, marginTop, 0, marginBottom] },
                    { text: fmt(fVal1), style: styleImp, margin: [0, marginTop, 0, marginBottom] },
                    { text: fmt(fVal2), style: styleImp, margin: [0, marginTop, 0, marginBottom] }
                ]);
            });
            
            return aRows;
        },

        _getSignatureBlock: function () {
            return {
                table: {
                    widths: ['*', 20, '*', 20, '*'],
                    body: [
                        [ { text: '____________________________', alignment: 'center', margin: [0, 20, 0, 5] }, {}, { text: '____________________________', alignment: 'center', margin: [0, 20, 0, 5] }, {}, { text: '____________________________', alignment: 'center', margin: [0, 20, 0, 5] } ],
                        [ { text: 'REPRESENTANTE LEGAL', style: 'firmaTexto' }, {}, { text: 'REPRESENTANTE LEGAL (Socio)', style: 'firmaTexto' }, {}, { text: 'CONTADOR/A', style: 'firmaTexto' } ]
                    ]
                },
                layout: 'noBorders'
            };
        }
    };

    return PdfHelper;
});