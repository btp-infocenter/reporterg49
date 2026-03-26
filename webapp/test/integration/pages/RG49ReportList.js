sap.ui.define(['sap/fe/test/ListReport'], function(ListReport) {
    'use strict';

    var CustomPageDefinitions = {
        actions: {},
        assertions: {}
    };

    return new ListReport(
        {
            appId: 'reporterg49',
            componentId: 'RG49ReportList',
            contextPath: '/RG49Report/Set'
        },
        CustomPageDefinitions
    );
});