sap.ui.define([
    "sap/ui/core/mvc/ControllerExtension",
    "sap/ui/mdc/p13n/StateUtil",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], function (ControllerExtension, StateUtil, JSONModel, MessageToast, Filter, FilterOperator) {
    "use strict";

    return ControllerExtension.extend("reporterg49.ext.ListReportExt", {
        _bSetup: false,
        _bDataLoaded: false,
        _oTreeTable: null,
        _sOriginalPath: null,
        _oOriginalModel: null,

        override: {
            onAfterRendering: function () {
                this._setup();
            }
        },

        _setup: function () {
            if (this._bSetup) return;

            var oView = this.base.getView();
            var oFilterBar = null;

            oView.findAggregatedObjects(true, function (oElem) {
                if (oElem.isA && oElem.isA("sap.ui.mdc.FilterBar") && !oFilterBar) {
                    oFilterBar = oElem;
                }
            });

            if (!oFilterBar) return;
            this._bSetup = true;
            this._oFilterBar = oFilterBar;

            var aItems = oFilterBar.getFilterItems ? oFilterBar.getFilterItems() : [];
            aItems.forEach(function (oField) {
                var sKey = oField.getPropertyKey ? oField.getPropertyKey() : "";
                if (!sKey && oField.getFieldPath) { sKey = oField.getFieldPath(); }
                if (sKey === "P_FiscalYearPrev") {
                    oField.setVisible(false);
                }
            });

            var that = this;
            var fnOrigTriggerSearch = oFilterBar.triggerSearch.bind(oFilterBar);
            oFilterBar.triggerSearch = function () {
                var oConditions = oFilterBar.getConditions();
                if (!oConditions.P_FiscalYear || oConditions.P_FiscalYear.length === 0) {
                    return fnOrigTriggerSearch();
                }

                var sFiscalYear = oConditions.P_FiscalYear[0].values[0];
                if (!sFiscalYear) return fnOrigTriggerSearch();

                var sFiscalYearPrev = (parseInt(sFiscalYear, 10) - 1).toString();

                // Reset para nueva búsqueda
                that._bDataLoaded = false;
                that._restoreODataBinding();
                
                // Mostrar indicador de carga
                that._setTableBusy(true);

                StateUtil.applyExternalState(oFilterBar, {
                    filter: {
                        "P_FiscalYearPrev": [{
                            operator: "EQ",
                            values: [sFiscalYearPrev],
                            validated: "Validated"
                        }]
                    }
                }).then(function () {
                    fnOrigTriggerSearch();
                    
                    setTimeout(function() {
                        that._loadAndBindLocal();
                    }, 1500);
                }).catch(function () {
                    that._setTableBusy(false);
                    fnOrigTriggerSearch();
                });
            };

            this._installRequestInterceptor();
        },

        _installRequestInterceptor: function () {
            if (window.__fiscalYearPrevInterceptor) return;
            window.__fiscalYearPrevInterceptor = true;

            var fnOrigSend = XMLHttpRequest.prototype.send;
            XMLHttpRequest.prototype.send = function (body) {
                if (typeof body === "string" && body.indexOf("P_FiscalYearPrev") > -1) {
                    body = body.replace(
                        /RG49Report\(([^)]+)\)/g,
                        function (fullMatch, params) {
                            var yearMatch = params.match(/P_FiscalYear='(\d+)'/);
                            if (yearMatch) {
                                var sPrev = (parseInt(yearMatch[1], 10) - 1).toString();
                                var fixed = params.replace(
                                    /P_FiscalYearPrev='[^']*'/,
                                    "P_FiscalYearPrev='" + sPrev + "'"
                                );
                                return "RG49Report(" + fixed + ")";
                            }
                            return fullMatch;
                        }
                    );
                }
                return fnOrigSend.call(this, body);
            };
        },

        _setTableBusy: function (bBusy) {
            var oTable = this._getTreeTable();
            if (oTable) {
                oTable.setBusy(bBusy);
            }
            
            // También buscar MDC Table wrapper
            var oView = this.base.getView();
            oView.findAggregatedObjects(true, function (oElem) {
                if (oElem.isA && oElem.isA("sap.ui.mdc.Table")) {
                    oElem.setBusy(bBusy);
                }
            });
        },

        _restoreODataBinding: function () {
            var oTable = this._getTreeTable();
            if (!oTable || !this._oOriginalModel || !this._sOriginalPath) {
                return;
            }

            try {
                oTable.unbindRows();
                oTable.setModel(this._oOriginalModel);
            } catch (e) {
                console.log("Error restaurando OData binding:", e);
            }
        },

        _loadAndBindLocal: function () {
            var that = this;
            var oView = this.base.getView();
            var oODataModel = oView.getModel();
            var oTable = this._getTreeTable();

            if (!oTable || !oODataModel) {
                setTimeout(function () {
                    that._loadAndBindLocal();
                }, 500);
                return;
            }

            if (this._bDataLoaded) {
                return;
            }

            if (!this._oOriginalModel) {
                this._oOriginalModel = oODataModel;
            }

            var oBinding = oTable.getBinding("rows");
            if (!oBinding) {
                setTimeout(function () {
                    that._loadAndBindLocal();
                }, 500);
                return;
            }

            var sPath = oBinding.getPath();
            var oContext = oBinding.getContext();
            var sFullPath = oContext ? oContext.getPath() + "/" + sPath : sPath;
            
            if (sFullPath.indexOf("/nodes") === -1) {
                this._sOriginalPath = sFullPath;
                window.__rg49ODataBindingPath = sFullPath;
            }

            var sRequestPath = this._sOriginalPath || sFullPath;
            if (sRequestPath.indexOf("/nodes") > -1) {
                setTimeout(function () {
                    that._bDataLoaded = false;
                    that._loadAndBindLocal();
                }, 500);
                return;
            }

            var aFilters = that._getActiveFilters();
            oODataModel.bindList(sRequestPath, undefined, undefined, aFilters).requestContexts(0, 9999).then(function (aContexts) {
                var aFlatData = aContexts.map(function (oCtx) {
                    return oCtx.getObject();
                });

                var aTreeData = that._buildTree(aFlatData);

                var oJSONModel = new JSONModel();
                oJSONModel.setSizeLimit(10000);
                oJSONModel.setData({ nodes: aTreeData });

                that._oLocalModel = oJSONModel;

                oTable.unbindRows();
                oTable.setModel(oJSONModel);
                oTable.bindRows({
                    path: "/nodes",
                    parameters: {
                        arrayNames: ["children"]
                    }
                });

                that._bDataLoaded = true;
                that._oTreeTable = oTable;
                
                that._replaceExpandCollapseButtons();
                
                // Ocultar indicador de carga
                that._setTableBusy(false);
                
                // MessageToast.show("Datos cargados. Navegación instantánea.");

            }).catch(function (oError) {
                // Ocultar indicador de carga en caso de error
                that._setTableBusy(false);
                MessageToast.show("Error al cargar datos");
                console.error(oError);
            });
        },

        _replaceExpandCollapseButtons: function () {
            var that = this;
            var oView = this.base.getView();
            
            oView.findAggregatedObjects(true, function (oElem) {
                if (oElem.isA && (oElem.isA("sap.m.OverflowToolbarButton") || oElem.isA("sap.m.Button"))) {
                    var sIcon = oElem.getIcon ? oElem.getIcon() : "";
                    
                    if (sIcon.indexOf("expand-all") > -1 || sIcon.indexOf("expand-group") > -1) {
                        oElem.mEventRegistry = oElem.mEventRegistry || {};
                        oElem.mEventRegistry.press = [];
                        oElem.attachPress(function() {
                            if (that._oTreeTable) {
                                that._oTreeTable.expandToLevel(99);
                            }
                        });
                    }
                    
                    if (sIcon.indexOf("collapse-all") > -1 || sIcon.indexOf("collapse-group") > -1) {
                        oElem.mEventRegistry = oElem.mEventRegistry || {};
                        oElem.mEventRegistry.press = [];
                        oElem.attachPress(function() {
                            if (that._oTreeTable) {
                                that._oTreeTable.collapseAll();
                            }
                        });
                    }
                }
            });
        },

        _buildTree: function (aFlatData) {
            var mNodeMap = {};
            var aRoots = [];
            var aMissingParents = [];

            aFlatData.forEach(function (oNode) {
                var oTreeNode = Object.assign({}, oNode);
                oTreeNode.NodeId = oNode.NodeId ? String(oNode.NodeId).trim() : "";
                oTreeNode.ParentId = oNode.ParentId ? String(oNode.ParentId).trim() : "";
                oTreeNode.children = [];
                mNodeMap[oTreeNode.NodeId] = oTreeNode;
            });

            Object.keys(mNodeMap).forEach(function (sNodeId) {
                var oTreeNode = mNodeMap[sNodeId];
                var sParentId = oTreeNode.ParentId;
                
                if (sParentId && sParentId !== "" && !mNodeMap[sParentId]) {
                    if (aMissingParents.indexOf(sParentId) === -1) {
                        aMissingParents.push(sParentId);
                        
                        var aParentParts = sParentId.split(".");
                        aParentParts.pop();
                        var sGrandParentId = aParentParts.join(".");
                        
                        mNodeMap[sParentId] = {
                            NodeId: sParentId,
                            ParentId: sGrandParentId,
                            Description: "(Nodo sin datos)",
                            NodeType: "F",
                            children: []
                        };
                    }
                }
            });

            Object.keys(mNodeMap).forEach(function (sNodeId) {
                var oTreeNode = mNodeMap[sNodeId];
                var sParentId = oTreeNode.ParentId;
                
                if (!sParentId || sParentId === "" || !mNodeMap[sParentId]) {
                    aRoots.push(oTreeNode);
                } else {
                    mNodeMap[sParentId].children.push(oTreeNode);
                }
            });

            var fnSortChildren = function (aNodes) {
                aNodes.sort(function (a, b) {
                    return a.NodeId.localeCompare(b.NodeId);
                });
                aNodes.forEach(function (oNode) {
                    if (oNode.children && oNode.children.length > 0) {
                        fnSortChildren(oNode.children);
                    }
                });
            };
            fnSortChildren(aRoots);

            console.log("Nodos raíz encontrados:", aRoots.length);
            
            if (aMissingParents.length > 0) {
                console.log("Nodos padre faltantes (creados como placeholder):", aMissingParents);
            }

            return aRoots;
        },

        _getActiveFilters: function () {
            if (!this._oFilterBar) return [];
            var aFilters = [];
            var oConditions = this._oFilterBar.getConditions();

            Object.keys(oConditions).forEach(function (sKey) {
                // Skip parameters - they're part of the OData function import path, not $filter
                if (sKey.indexOf("P_") === 0) return;

                var aConds = oConditions[sKey];
                if (!aConds || aConds.length === 0) return;

                aConds.forEach(function (oCond) {
                    var aVals = oCond.values || [];
                    if (aVals.length === 0) return;

                    var sOp = oCond.operator;
                    if (sOp === "BT" && aVals.length >= 2) {
                        aFilters.push(new Filter(sKey, FilterOperator.BT, aVals[0], aVals[1]));
                    } else if (FilterOperator[sOp]) {
                        aFilters.push(new Filter(sKey, FilterOperator[sOp], aVals[0]));
                    }
                });
            });

            return aFilters;
        },

        _getTreeTable: function () {
            if (this._oTreeTable && this._bDataLoaded) {
                return this._oTreeTable;
            }
            
            var oView = this.base.getView();
            var aTables = oView.findAggregatedObjects(true, function (oControl) {
                return oControl.isA && oControl.isA("sap.ui.table.TreeTable");
            });
            
            if (aTables.length > 0) {
                this._oTreeTable = aTables[0];
                return this._oTreeTable;
            }
            
            return null;
        }
    });
});