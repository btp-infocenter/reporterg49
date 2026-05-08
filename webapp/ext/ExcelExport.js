sap.ui.define([
    "reporterg49/ext/PdfExport",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/m/BusyDialog",
    "sap/m/Dialog",
    "sap/m/RadioButtonGroup",
    "sap/m/RadioButton",
    "sap/m/Button",
    "sap/m/VBox",
    "sap/m/Label",
    "sap/m/CheckBox"
], function (PdfExport, MessageToast, MessageBox, BusyDialog, Dialog, RadioButtonGroup, RadioButton, Button, VBox, Label, CheckBox) {
    'use strict';

    var EXCELJS_URL = "https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js";

    var ANEXOS_CONFIG = {
        "1": { titulo: "ANEXO 1",   subtitulo: "BALANCE GENERAL",                          cuentasDesde: 1,    cuentasHasta: 3,    nombreArchivo: "Balance_General",            tipo: "balance" },
        "2": { titulo: "ANEXO Nº 2", subtitulo: "ESTADO DE RESULTADOS",                    cuentasDesde: 4,    cuentasHasta: 20,   nombreArchivo: "Estado_Resultados",          tipo: "resultados" },
        "3": { titulo: "ANEXO N° 3", subtitulo: "ESTADO DE FLUJO DE EFECTIVO",             cuentasDesde: 8000, cuentasHasta: 8022, nombreArchivo: "Flujo_Efectivo",             tipo: "flujo" },
        "4": { titulo: "ANEXO N° 4", subtitulo: "ESTADO DE CAMBIOS DEL PATRIMONIO NETO",   cuentasDesde: 3,    cuentasHasta: 3,    nombreArchivo: "Estado_Cambios_Patrimonio",  tipo: "patrimonio" }
    };

    var ESTADO_RESULTADOS_SEPARADORES = {
        "5": "MENOS:", "8": "MÁS:", "10": "MENOS:", "11": "MENOS:", "13": "MENOS:", "15": "MENOS:"
    };

    var CUENTAS_TOTALES_CALCULADOS = { "6": true, "9": true, "12": true, "16": true, "18": true, "20": true };

    var NUM_FMT = '#,##0;(#,##0);"-"';

    var THIN_DARK = { style: 'thin', color: { argb: 'FF333333' } };
    var THIN_GRAY = { style: 'thin', color: { argb: 'FFCCCCCC' } };
    var FILL_HEADER_GRAY = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
    var FILL_COL_HEADER  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
    var FILL_FLUJO       = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } };

    var oBusyDialog = new BusyDialog({ title: "Por favor espere", text: "Generando Excel..." });

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

    var ExcelExport = {
        _exceljsLoaded: false,
        _bHideAnterior: false,

        exportarExcel: function (oBindingContext, aSelectedContexts) {
            try {
                var oView;
                if (this.getView) oView = this.getView();
                else if (this._controller) oView = this._controller.getView();
                else if (this._view) oView = this._view;
                if (!oView) { MessageBox.error("Vista no encontrada."); return; }

                var oModel = oView.getModel();

                var oTable = null;
                oView.findAggregatedObjects(true, function (oElem) {
                    if (oElem.isA && (oElem.isA("sap.ui.mdc.Table") || oElem.isA("sap.ui.table.TreeTable"))) {
                        if (!oTable) oTable = oElem;
                    }
                });
                if (!oTable) { MessageBox.error("Tabla no encontrada."); return; }

                var oRowBinding = oTable.getRowBinding ? oTable.getRowBinding() : oTable.getBinding("rows");
                if (!oRowBinding) {
                    MessageBox.warning("No hay datos cargados. Presione 'Ir' primero.");
                    return;
                }

                var sBindingPath = "";
                var oHeaderCtx = oRowBinding.getHeaderContext ? oRowBinding.getHeaderContext() : null;
                if (oHeaderCtx) {
                    sBindingPath = oHeaderCtx.getPath();
                } else {
                    var oCtx = oRowBinding.getContext ? oRowBinding.getContext() : null;
                    sBindingPath = oCtx ? (oCtx.getPath() + "/" + oRowBinding.getPath()) : oRowBinding.getPath();
                }

                var oParams = _extractParams(sBindingPath);
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

                ExcelExport._mostrarDialogoSeleccion();
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
                title: "Reporte RG49 - Excel",
                content: new VBox({
                    items: [
                        new Label({ text: "Seleccione reporte:", design: "Bold" }).addStyleClass("sapUiSmallMarginBottom"),
                        oRadioGroup,
                        oCheckHideAnterior.addStyleClass("sapUiSmallMarginTop")
                    ]
                }).addStyleClass("sapUiSmallMargin"),
                beginButton: new Button({
                    text: "Generar Excel", type: "Emphasized",
                    press: function () {
                        var sAnexo = (oRadioGroup.getSelectedIndex() + 1).toString();
                        ExcelExport._bHideAnterior = oCheckHideAnterior.getSelected();
                        oDialog.close();
                        ExcelExport._generarExcelConAnexo(sAnexo);
                    }
                }),
                endButton: new Button({ text: "Cancelar", press: function () { oDialog.close(); } }),
                afterClose: function () { oDialog.destroy(); }
            });
            oDialog.open();
        },

        _loadExcelJS: function () {
            return new Promise(function (resolve, reject) {
                if (window.ExcelJS) { ExcelExport._exceljsLoaded = true; resolve(); return; }
                var existing = document.getElementById("exceljs-script");
                if (existing) {
                    existing.addEventListener("load", function () { ExcelExport._exceljsLoaded = true; resolve(); });
                    existing.addEventListener("error", reject);
                    return;
                }
                var s = document.createElement("script");
                s.id = "exceljs-script"; s.src = EXCELJS_URL;
                s.onload = function () { ExcelExport._exceljsLoaded = true; resolve(); };
                s.onerror = reject;
                document.head.appendChild(s);
            });
        },

        _generarExcelConAnexo: async function (sAnexo) {
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

                await ExcelExport._loadExcelJS();
                var oHeaderData = await PdfExport._readSociedadData();
                var oFilterData = PdfExport._oFilterData;

                var workbook = new window.ExcelJS.Workbook();
                workbook.creator = "RG49 Report";
                workbook.created = new Date();

                if (oAnexoConfig.tipo === "patrimonio") {
                    ExcelExport._buildPatrimonioSheet(workbook, oHeaderData, aDataProcesada, oFilterData, oAnexoConfig);
                } else if (oAnexoConfig.tipo === "flujo") {
                    ExcelExport._buildFlujoSheet(workbook, oHeaderData, aDataProcesada, oFilterData, oAnexoConfig);
                } else {
                    ExcelExport._buildBalanceResultadosSheet(workbook, oHeaderData, aDataProcesada, oFilterData, oAnexoConfig);
                }

                var sFileName = oAnexoConfig.nombreArchivo + "_" + oFilterData.sociedad + ".xlsx";
                var buffer = await workbook.xlsx.writeBuffer();
                var blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                var sUrl = URL.createObjectURL(blob);
                var link = document.createElement('a');
                link.href = sUrl; link.download = sFileName;
                document.body.appendChild(link); link.click(); document.body.removeChild(link);
                setTimeout(function () { URL.revokeObjectURL(sUrl); }, 1000);
                oBusyDialog.close();
                MessageToast.show("Excel descargado: " + sFileName);
            } catch (error) {
                console.error(error);
                MessageBox.error(error.message || String(error));
                oBusyDialog.close();
            }
        },

        _colLetter: function (iCol) {
            var s = '';
            while (iCol > 0) {
                var r = (iCol - 1) % 26;
                s = String.fromCharCode(65 + r) + s;
                iCol = Math.floor((iCol - 1) / 26);
            }
            return s;
        },

        _splitSpans: function (iTotal, aWeights) {
            var aResult = aWeights.map(function () { return 1; });
            var iRemaining = iTotal - aResult.length;
            if (iRemaining <= 0) return aResult;
            var iSumW = aWeights.reduce(function (a, b) { return a + b; }, 0);
            var aFloat = aWeights.map(function (w) { return w / iSumW * iRemaining; });
            var aInt = aFloat.map(function (v) { return Math.floor(v); });
            var iAssigned = aInt.reduce(function (a, b) { return a + b; }, 0);
            var iLeft = iRemaining - iAssigned;
            var aFrac = aFloat.map(function (v, i) { return { i: i, frac: v - Math.floor(v) }; }).sort(function (a, b) { return b.frac - a.frac; });
            for (var k = 0; k < iLeft; k++) aInt[aFrac[k].i]++;
            return aResult.map(function (v, i) { return v + aInt[i]; });
        },

        _setBorders: function (cell, oBorder) {
            cell.border = oBorder;
        },

        _writeIdSection: function (sheet, iRow, aCells) {
            var iCol = 1;
            aCells.forEach(function (oCell) {
                var startLetter = ExcelExport._colLetter(iCol);
                var endLetter = ExcelExport._colLetter(iCol + oCell.span - 1);
                if (oCell.span > 1) sheet.mergeCells(startLetter + iRow + ':' + endLetter + iRow);
                var c = sheet.getCell(startLetter + iRow);
                c.value = oCell.text;
                c.font = { bold: true, size: 9 };
                c.fill = FILL_HEADER_GRAY;
                c.alignment = { horizontal: 'left', vertical: 'middle' };
                for (var i = iCol; i <= iCol + oCell.span - 1; i++) {
                    sheet.getCell(ExcelExport._colLetter(i) + iRow).border = { top: THIN_DARK, bottom: THIN_DARK, left: THIN_DARK, right: THIN_DARK };
                }
                iCol += oCell.span;
            });
            sheet.getRow(iRow).height = 18;
        },

        _writeIdRow: function (sheet, iRow, aCells, bBold, bItalic, iSize) {
            var iCol = 1;
            aCells.forEach(function (oCell) {
                var startLetter = ExcelExport._colLetter(iCol);
                var endLetter = ExcelExport._colLetter(iCol + oCell.span - 1);
                if (oCell.span > 1) sheet.mergeCells(startLetter + iRow + ':' + endLetter + iRow);
                var c = sheet.getCell(startLetter + iRow);
                c.value = oCell.text;
                c.font = { size: iSize, bold: !!bBold, italic: !!bItalic, color: bItalic ? { argb: 'FF555555' } : undefined };
                c.alignment = { horizontal: oCell.align || 'left', vertical: 'middle' };
                for (var i = iCol; i <= iCol + oCell.span - 1; i++) {
                    sheet.getCell(ExcelExport._colLetter(i) + iRow).border = { left: THIN_DARK, right: THIN_DARK };
                }
                iCol += oCell.span;
            });
        },

        _buildHeader: function (sheet, oHeader, oFilterData, oAnexoConfig, iTotalCols) {
            var sEj = oFilterData.ejercicio;
            var sDesde = _periodoAFecha(oFilterData.periodoDesde, sEj, false);
            var sHasta = _periodoAFecha(oFilterData.periodoHasta, sEj, true);
            var sLast = ExcelExport._colLetter(iTotalCols);

            sheet.mergeCells('A1:' + sLast + '1');
            var t1 = sheet.getCell('A1');
            t1.value = oAnexoConfig.titulo;
            t1.font = { bold: true, size: 14 };
            t1.alignment = { horizontal: 'center', vertical: 'middle' };
            sheet.getRow(1).height = 22;

            sheet.mergeCells('A2:' + sLast + '2');
            var t2 = sheet.getCell('A2');
            t2.value = oAnexoConfig.subtitulo;
            t2.font = { bold: true, size: 11 };
            t2.alignment = { horizontal: 'center', vertical: 'middle' };
            sheet.getRow(2).height = 18;

            sheet.getRow(3).height = 6;

            var aSpans4 = ExcelExport._splitSpans(iTotalCols, [3, 1, 1, 1]);
            ExcelExport._writeIdSection(sheet, 4, [
                { text: '1- IDENTIFICACIÓN DEL CONTRIBUYENTE', span: aSpans4[0] + aSpans4[1] },
                { text: '2- EJERCICIO FISCAL', span: aSpans4[2] + aSpans4[3] }
            ]);
            ExcelExport._writeIdRow(sheet, 5, [
                { text: 'RAZÓN SOCIAL O NOMBRES Y APELLIDOS', span: aSpans4[0] },
                { text: 'IDENTIFICADOR RUC', span: aSpans4[1], align: 'center' },
                { text: 'DESDE', span: aSpans4[2], align: 'center' },
                { text: 'HASTA', span: aSpans4[3], align: 'center' }
            ], false, true, 8);
            ExcelExport._writeIdRow(sheet, 6, [
                { text: oHeader.razonSocial, span: aSpans4[0] },
                { text: oHeader.rucEmpresa, span: aSpans4[1], align: 'center' },
                { text: sDesde, span: aSpans4[2], align: 'center' },
                { text: sHasta, span: aSpans4[3], align: 'center' }
            ], true, false, 10);
            // Restore non-bold for non-name cells in row 6
            sheet.getCell(ExcelExport._colLetter(aSpans4[0] + 1) + 6).font = { size: 10 };
            sheet.getCell(ExcelExport._colLetter(aSpans4[0] + aSpans4[1] + 1) + 6).font = { size: 10 };
            sheet.getCell(ExcelExport._colLetter(aSpans4[0] + aSpans4[1] + aSpans4[2] + 1) + 6).font = { size: 10 };

            sheet.getRow(7).height = 4;

            var aSpans5 = ExcelExport._splitSpans(iTotalCols, [2, 2, 1, 2, 1]);
            ExcelExport._writeIdSection(sheet, 8, [
                { text: '3- IDENTIFICACIÓN DEL REPRESENTANTE LEGAL', span: aSpans5[0] },
                { text: '4- IDENTIFICACIÓN DEL CONTADOR', span: aSpans5[1] + aSpans5[2] },
                { text: '5- IDENTIFICACIÓN DEL AUDITOR', span: aSpans5[3] + aSpans5[4] }
            ]);
            ExcelExport._writeIdRow(sheet, 9, [
                { text: 'APELLIDOS/NOMBRES', span: aSpans5[0] },
                { text: 'APELLIDOS/NOMBRES', span: aSpans5[1] },
                { text: 'RUC', span: aSpans5[2], align: 'center' },
                { text: 'APELLIDOS/NOMBRES', span: aSpans5[3] },
                { text: 'RUC', span: aSpans5[4], align: 'center' }
            ], false, true, 8);
            ExcelExport._writeIdRow(sheet, 10, [
                { text: oHeader.representanteLegal, span: aSpans5[0] },
                { text: oHeader.contador, span: aSpans5[1] },
                { text: oHeader.rucContador, span: aSpans5[2], align: 'center' },
                { text: oHeader.auditor, span: aSpans5[3] },
                { text: oHeader.rucAuditor, span: aSpans5[4], align: 'center' }
            ], false, false, 10);

            sheet.getRow(11).height = 8;
            return 12;
        },

        _writeSignatureBlock: function (sheet, iStartRow, iTotalCols) {
            var iRow = iStartRow + 2;
            var aSpans = ExcelExport._splitSpans(iTotalCols, [2, 2, 2]);
            var iCol = 1;
            var aFirma = [
                { text: '____________________________', span: aSpans[0] },
                { text: '____________________________', span: aSpans[1] },
                { text: '____________________________', span: aSpans[2] }
            ];
            aFirma.forEach(function (oCell) {
                var s = ExcelExport._colLetter(iCol);
                var e = ExcelExport._colLetter(iCol + oCell.span - 1);
                if (oCell.span > 1) sheet.mergeCells(s + iRow + ':' + e + iRow);
                var c = sheet.getCell(s + iRow);
                c.value = oCell.text;
                c.alignment = { horizontal: 'center', vertical: 'bottom' };
                c.font = { size: 10 };
                iCol += oCell.span;
            });
            sheet.getRow(iRow).height = 30;

            var aLabels = [
                { text: 'REPRESENTANTE LEGAL', span: aSpans[0] },
                { text: 'REPRESENTANTE LEGAL (Socio)', span: aSpans[1] },
                { text: 'CONTADOR/A', span: aSpans[2] }
            ];
            iCol = 1;
            aLabels.forEach(function (oCell) {
                var s = ExcelExport._colLetter(iCol);
                var e = ExcelExport._colLetter(iCol + oCell.span - 1);
                if (oCell.span > 1) sheet.mergeCells(s + (iRow + 1) + ':' + e + (iRow + 1));
                var c = sheet.getCell(s + (iRow + 1));
                c.value = oCell.text;
                c.alignment = { horizontal: 'center', vertical: 'middle' };
                c.font = { size: 10, bold: true };
                iCol += oCell.span;
            });
        },

        _buildBalanceResultadosSheet: function (workbook, oHeader, aData, oFilterData, oAnexoConfig) {
            var sEj = oFilterData.ejercicio;
            var sEjAnt = (parseInt(sEj) - 1).toString();
            var bHideAnterior = (oAnexoConfig.tipo === "balance" && ExcelExport._bHideAnterior);
            var iCols = bHideAnterior ? 3 : 4;

            var sheet = workbook.addWorksheet(oAnexoConfig.titulo.replace(/\s+/g, '_'));
            sheet.pageSetup = { orientation: 'portrait', paperSize: 5, fitToPage: true, fitToWidth: 1, fitToHeight: 0,
                margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 } };
            sheet.columns = bHideAnterior
                ? [{ width: 12 }, { width: 60 }, { width: 18 }]
                : [{ width: 12 }, { width: 55 }, { width: 18 }, { width: 18 }];

            var iRow = ExcelExport._buildHeader(sheet, oHeader, oFilterData, oAnexoConfig, iCols);

            var headerRow = sheet.getRow(iRow);
            headerRow.getCell(1).value = '';
            headerRow.getCell(2).value = '';
            headerRow.getCell(3).value = sEj;
            if (!bHideAnterior) headerRow.getCell(4).value = sEjAnt;
            for (var c = 1; c <= iCols; c++) {
                var cell = headerRow.getCell(c);
                cell.font = { bold: true, size: 10 };
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
                cell.fill = FILL_COL_HEADER;
                cell.border = { top: THIN_DARK, bottom: THIN_DARK, left: THIN_DARK, right: THIN_DARK };
            }
            headerRow.height = 22;
            iRow++;

            if (oAnexoConfig.tipo === "resultados") {
                iRow = ExcelExport._writeFilasResultados(sheet, iRow, aData);
            } else {
                iRow = ExcelExport._writeFilasBalance(sheet, iRow, aData, bHideAnterior);
            }

            // Bottom border on last data row
            var lastRow = sheet.getRow(iRow - 1);
            for (var k = 1; k <= iCols; k++) {
                var b = lastRow.getCell(k).border || {};
                lastRow.getCell(k).border = { top: b.top, bottom: THIN_DARK, left: b.left, right: b.right };
            }

            ExcelExport._writeSignatureBlock(sheet, iRow, iCols);
        },

        _writeFilasBalance: function (sheet, iStartRow, aData, bHideAnterior) {
            var iRow = iStartRow;
            var iCols = bHideAnterior ? 3 : 4;

            aData.forEach(function (oRow, index) {
                var sCuenta = PdfExport._formatearCuenta(oRow.Rg49Account || "");
                var sDescripcion = oRow.Description || "";
                var fVal1 = Math.abs(parseFloat(oRow.ImporteActual) || 0);
                var fVal2 = Math.abs(parseFloat(oRow.ImporteAnterior) || 0);
                var iLevel = sCuenta.split('.').length;

                var bBold = (iLevel <= 3);
                var iIndent = Math.max(0, iLevel - 1);

                var row = sheet.getRow(iRow);
                row.getCell(1).value = sCuenta;
                row.getCell(2).value = sDescripcion;
                row.getCell(3).value = fVal1;
                if (!bHideAnterior) row.getCell(4).value = fVal2;

                for (var c = 1; c <= iCols; c++) {
                    var cell = row.getCell(c);
                    cell.font = { size: 10, bold: bBold };
                    cell.border = { top: THIN_GRAY, bottom: THIN_GRAY, left: THIN_DARK, right: THIN_DARK };
                }
                row.getCell(1).alignment = { vertical: 'middle' };
                row.getCell(2).alignment = { vertical: 'middle', indent: iIndent };
                row.getCell(3).alignment = { horizontal: 'right', vertical: 'middle' };
                row.getCell(3).numFmt = NUM_FMT;
                if (!bHideAnterior) {
                    row.getCell(4).alignment = { horizontal: 'right', vertical: 'middle' };
                    row.getCell(4).numFmt = NUM_FMT;
                }

                if (iLevel === 1 && index > 0) row.height = 22;
                iRow++;
            });
            return iRow;
        },

        _writeFilasResultados: function (sheet, iStartRow, aData) {
            var iRow = iStartRow;
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
                    var sepRow = sheet.getRow(iRow);
                    sepRow.getCell(2).value = ESTADO_RESULTADOS_SEPARADORES[sCuentaPrincipalStr];
                    sepRow.getCell(2).font = { size: 10, bold: true, underline: true };
                    sepRow.getCell(2).alignment = { vertical: 'middle' };
                    for (var cc = 1; cc <= 4; cc++) {
                        sepRow.getCell(cc).border = { left: THIN_DARK, right: THIN_DARK };
                    }
                    sepRow.height = 18;
                    iRow++;
                }

                var bBold = (iLevel === 1);
                var bTotal = !!CUENTAS_TOTALES_CALCULADOS[sCuentaPrincipalStr];

                var row = sheet.getRow(iRow);
                row.getCell(1).value = sCuenta;
                row.getCell(2).value = sDescripcion;
                row.getCell(3).value = fVal1;
                row.getCell(4).value = fVal2;

                var oFont = { size: 10, bold: bBold || bTotal };
                for (var c = 1; c <= 4; c++) {
                    var cell = row.getCell(c);
                    cell.font = oFont;
                    cell.border = { top: THIN_GRAY, bottom: THIN_GRAY, left: THIN_DARK, right: THIN_DARK };
                }
                row.getCell(1).alignment = { vertical: 'middle' };
                row.getCell(2).alignment = { vertical: 'middle', indent: Math.max(0, iLevel - 1) };
                row.getCell(3).alignment = { horizontal: 'right', vertical: 'middle' };
                row.getCell(4).alignment = { horizontal: 'right', vertical: 'middle' };
                row.getCell(3).numFmt = NUM_FMT;
                row.getCell(4).numFmt = NUM_FMT;
                if (bTotal) row.height = 22;

                iRow++;
            });
            return iRow;
        },

        _buildFlujoSheet: function (workbook, oHeader, aData, oFilterData, oAnexoConfig) {
            var sEj = oFilterData.ejercicio;
            var sEjAnt = (parseInt(sEj) - 1).toString();
            var iCols = 3;

            var sheet = workbook.addWorksheet(oAnexoConfig.titulo.replace(/\s+/g, '_'));
            sheet.pageSetup = { orientation: 'portrait', paperSize: 5, fitToPage: true, fitToWidth: 1, fitToHeight: 0,
                margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 } };
            sheet.columns = [{ width: 70 }, { width: 22 }, { width: 22 }];

            var iRow = ExcelExport._buildHeader(sheet, oHeader, oFilterData, oAnexoConfig, iCols);

            var hRow = sheet.getRow(iRow);
            hRow.getCell(1).value = '';
            hRow.getCell(2).value = sEj;
            hRow.getCell(3).value = sEjAnt;
            for (var c = 1; c <= iCols; c++) {
                var cell = hRow.getCell(c);
                cell.font = { bold: true, size: 10 };
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
                cell.fill = FILL_COL_HEADER;
                cell.border = { top: THIN_DARK, bottom: THIN_DARK, left: THIN_DARK, right: THIN_DARK };
            }
            hRow.height = 22;
            iRow++;

            aData.forEach(function (oFlujoRow) {
                var sDescripcion = oFlujoRow.Description || "";
                var fValVigente = oFlujoRow.ImporteVigente || 0;
                var fValAnterior = oFlujoRow.ImporteAnterior || 0;
                var sTipo = oFlujoRow.tipo || "item";
                var row = sheet.getRow(iRow);

                if (sTipo === "titulo") {
                    row.getCell(1).value = sDescripcion.toUpperCase();
                    row.getCell(2).value = '';
                    row.getCell(3).value = '';
                    for (var c1 = 1; c1 <= 3; c1++) {
                        var ce = row.getCell(c1);
                        ce.font = { bold: true, size: 10 };
                        ce.fill = FILL_FLUJO;
                        ce.alignment = { vertical: 'middle' };
                        ce.border = { top: THIN_GRAY, bottom: THIN_GRAY, left: THIN_DARK, right: THIN_DARK };
                    }
                } else if (sTipo === "titulo_con_valor" || sTipo === "subtotal") {
                    row.getCell(1).value = sDescripcion.toUpperCase();
                    row.getCell(2).value = fValVigente;
                    row.getCell(3).value = fValAnterior;
                    for (var c2 = 1; c2 <= 3; c2++) {
                        var ce2 = row.getCell(c2);
                        ce2.font = { bold: true, size: 10 };
                        ce2.fill = FILL_FLUJO;
                        ce2.border = { top: THIN_GRAY, bottom: THIN_GRAY, left: THIN_DARK, right: THIN_DARK };
                    }
                    row.getCell(1).alignment = { vertical: 'middle' };
                    row.getCell(2).alignment = { horizontal: 'right', vertical: 'middle' };
                    row.getCell(3).alignment = { horizontal: 'right', vertical: 'middle' };
                    row.getCell(2).numFmt = NUM_FMT;
                    row.getCell(3).numFmt = NUM_FMT;
                } else {
                    row.getCell(1).value = sDescripcion;
                    row.getCell(2).value = fValVigente;
                    row.getCell(3).value = fValAnterior;
                    for (var c3 = 1; c3 <= 3; c3++) {
                        var ce3 = row.getCell(c3);
                        ce3.font = { size: 10 };
                        ce3.border = { top: THIN_GRAY, bottom: THIN_GRAY, left: THIN_DARK, right: THIN_DARK };
                    }
                    row.getCell(1).alignment = { vertical: 'middle', indent: 1 };
                    row.getCell(2).alignment = { horizontal: 'right', vertical: 'middle' };
                    row.getCell(3).alignment = { horizontal: 'right', vertical: 'middle' };
                    row.getCell(2).numFmt = NUM_FMT;
                    row.getCell(3).numFmt = NUM_FMT;
                }
                iRow++;
            });

            var lastRow = sheet.getRow(iRow - 1);
            for (var kk = 1; kk <= iCols; kk++) {
                var b = lastRow.getCell(kk).border || {};
                lastRow.getCell(kk).border = { top: b.top, bottom: THIN_DARK, left: b.left, right: b.right };
            }

            ExcelExport._writeSignatureBlock(sheet, iRow, iCols);
        },

        _buildPatrimonioSheet: function (workbook, oHeader, aData, oFilterData, oAnexoConfig) {
            var sEj = oFilterData.ejercicio;
            var sEjAnt = (parseInt(sEj) - 1).toString();
            var iCols = 8;

            var sheet = workbook.addWorksheet(oAnexoConfig.titulo.replace(/\s+/g, '_'));
            sheet.pageSetup = { orientation: 'landscape', paperSize: 5, fitToPage: true, fitToWidth: 1, fitToHeight: 0,
                margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0.3, footer: 0.3 } };
            sheet.columns = [
                { width: 50 }, { width: 16 }, { width: 14 }, { width: 14 },
                { width: 14 }, { width: 18 }, { width: 18 }, { width: 18 }
            ];

            var iRow = ExcelExport._buildHeader(sheet, oHeader, oFilterData, oAnexoConfig, iCols);

            var oP = PdfExport._extraerDatosPatrimonio(aData, sEj, sEjAnt);

            var topRow = sheet.getRow(iRow);
            topRow.getCell(1).value = '';
            topRow.getCell(2).value = 'CAPITAL';
            topRow.getCell(3).value = 'RESERVAS';
            sheet.mergeCells(iRow, 3, iRow, 5);
            topRow.getCell(6).value = 'RESULTADOS';
            sheet.mergeCells(iRow, 6, iRow, 7);
            topRow.getCell(8).value = 'PATRIMONIO';

            for (var c = 1; c <= 8; c++) {
                var cell = topRow.getCell(c);
                cell.font = { bold: true, size: 9 };
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } };
                cell.border = { top: THIN_DARK, bottom: THIN_DARK, left: THIN_DARK, right: THIN_DARK };
            }
            topRow.height = 18;
            iRow++;

            var subRow = sheet.getRow(iRow);
            var aSubHeaders = ['CUENTAS', 'INTEGRADO', 'LEGAL', 'DE REVALÚO', 'OTRAS', 'ACUMULADOS', 'DEL EJERCICIO', 'NETO'];
            for (var s = 1; s <= 8; s++) {
                var c2 = subRow.getCell(s);
                c2.value = aSubHeaders[s - 1];
                c2.font = { bold: true, size: 9 };
                c2.alignment = { horizontal: 'center', vertical: 'middle' };
                c2.fill = FILL_COL_HEADER;
                c2.border = { top: THIN_DARK, bottom: THIN_DARK, left: THIN_DARK, right: THIN_DARK };
            }
            subRow.height = 18;
            iRow++;

            // SALDO INICIO ANTERIOR
            var saldoInicioAnt = [
                Math.abs(oP.capitalIntegrado_2024),
                0, 0, 0,
                oP.resultadoAcumulado_2024,
                oP.resultadoEjercicioInicio_2024,
                0
            ];
            saldoInicioAnt[6] = saldoInicioAnt[0] + saldoInicioAnt[4] + saldoInicioAnt[5];

            iRow = ExcelExport._writePatrimonioFila(sheet, iRow, 'SALDO AL INICIO DEL EJERCICIO ' + sEjAnt, saldoInicioAnt, true, true);

            iRow = ExcelExport._writePatrimonioFila(sheet, iRow, 'MOVIMIENTOS DEL EJERCICIO ' + sEjAnt, [null, null, null, null, null, null, null], true, false);
            iRow = ExcelExport._writePatrimonioFila(sheet, iRow, 'INTEGRACIÓN DE CAPITAL', [null, null, null, null, null, null, null], false, false);

            var transferenciaDividendosAnt = oP.transferenciaDividendos_2024;
            iRow = ExcelExport._writePatrimonioFila(sheet, iRow, 'TRANSFERENCIA A DIVIDENDOS A PAGAR', [null, null, null, null, transferenciaDividendosAnt, transferenciaDividendosAnt, null], false, false);

            iRow = ExcelExport._writePatrimonioFila(sheet, iRow, 'AJUSTES/DESAFECTAC. DE RESULT. ACUMULADOS', [null, null, null, null, null, null, null], false, false);
            iRow = ExcelExport._writePatrimonioFila(sheet, iRow, 'RESERVA LEGAL', [null, null, null, null, null, null, null], false, false);
            iRow = ExcelExport._writePatrimonioFila(sheet, iRow, 'RESERVA DE REVALÚO', [null, null, null, null, null, null, null], false, false);
            iRow = ExcelExport._writePatrimonioFila(sheet, iRow, 'OTRAS RESERVAS', [null, null, null, null, null, null, null], false, false);

            var resultadoEjercicioAnt = -oP.resultadoEjercicio_2024;
            iRow = ExcelExport._writePatrimonioFila(sheet, iRow, 'RESULTADO DEL EJERCICIO ' + sEjAnt, [null, null, null, null, null, resultadoEjercicioAnt, resultadoEjercicioAnt], true, false);

            var saldoCierreAnt = [
                saldoInicioAnt[0],
                0, 0, 0,
                saldoInicioAnt[4] + transferenciaDividendosAnt,
                resultadoEjercicioAnt,
                0
            ];
            saldoCierreAnt[6] = saldoInicioAnt[6] + resultadoEjercicioAnt;

            iRow = ExcelExport._writePatrimonioFila(sheet, iRow, 'SALDO AL CIERRE DEL EJERCICIO ' + sEjAnt + ' = INICIO DEL EJERCICIO ' + sEj, saldoCierreAnt, true, true);

            iRow = ExcelExport._writePatrimonioFila(sheet, iRow, 'MOVIMIENTOS DEL EJERCICIO ' + sEj, [null, null, null, null, null, null, null], true, false);
            iRow = ExcelExport._writePatrimonioFila(sheet, iRow, 'INTEGRACIÓN DE CAPITAL', [null, null, null, null, null, null, null], false, false);
            iRow = ExcelExport._writePatrimonioFila(sheet, iRow, 'TRANSFERENCIA A DIVIDENDOS A PAGAR', [null, null, null, null, null, null, null], false, false);

            var transferenciaResultadosAct = -oP.transferenciaResultados_2025;
            iRow = ExcelExport._writePatrimonioFila(sheet, iRow, 'TRANSFERENCIA A RESULTADOS ACUMULADOS', [null, null, null, null, transferenciaResultadosAct, -transferenciaResultadosAct, null], false, false);

            iRow = ExcelExport._writePatrimonioFila(sheet, iRow, 'RESERVA LEGAL', [null, null, null, null, null, null, null], false, false);
            iRow = ExcelExport._writePatrimonioFila(sheet, iRow, 'RESERVA DE REVALÚO', [null, null, null, null, null, null, null], false, false);
            iRow = ExcelExport._writePatrimonioFila(sheet, iRow, 'OTRAS RESERVAS', [null, null, null, null, null, null, null], false, false);

            var resultadoEjercicioActNeg = -oP.resultadoEjercicio_2025;
            iRow = ExcelExport._writePatrimonioFila(sheet, iRow, 'RESULTADO DEL EJERCICIO ' + sEj, [null, null, null, null, null, resultadoEjercicioActNeg, resultadoEjercicioActNeg], true, false);

            var saldoCierreAct = [
                saldoInicioAnt[0],
                0, 0, 0,
                saldoCierreAnt[4] + transferenciaResultadosAct,
                resultadoEjercicioActNeg,
                0
            ];
            saldoCierreAct[6] = saldoCierreAnt[6] + resultadoEjercicioActNeg;

            iRow = ExcelExport._writePatrimonioFila(sheet, iRow, 'SALDO AL CIERRE DEL EJERCICIO ' + sEj, saldoCierreAct, true, true);

            ExcelExport._writeSignatureBlock(sheet, iRow, iCols);
        },

        _writePatrimonioFila: function (sheet, iRow, sLabel, aValues, bTitulo, bMostrarCeros) {
            var row = sheet.getRow(iRow);
            row.getCell(1).value = sLabel;
            row.getCell(1).font = { size: bTitulo ? 9 : 8.5, bold: bTitulo };
            row.getCell(1).alignment = { vertical: 'middle', indent: bTitulo ? 0 : 1, wrapText: true };
            row.getCell(1).border = { top: THIN_GRAY, bottom: THIN_GRAY, left: THIN_DARK, right: THIN_DARK };

            for (var i = 0; i < 7; i++) {
                var cell = row.getCell(i + 2);
                var v = aValues[i];
                if (bMostrarCeros) {
                    cell.value = (v === null || v === undefined || isNaN(v) || v === 0) ? '-' : v;
                } else {
                    cell.value = (v === null || v === undefined || isNaN(v) || v === 0) ? '' : v;
                }
                cell.font = { size: bTitulo ? 9 : 8.5, bold: bTitulo };
                cell.alignment = { horizontal: 'right', vertical: 'middle' };
                cell.numFmt = NUM_FMT;
                cell.border = { top: THIN_GRAY, bottom: THIN_GRAY, left: THIN_DARK, right: THIN_DARK };
            }
            row.height = bTitulo ? 20 : 16;
            return iRow + 1;
        }
    };

    return ExcelExport;
});
