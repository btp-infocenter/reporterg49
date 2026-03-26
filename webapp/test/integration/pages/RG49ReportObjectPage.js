sap.ui.define(['sap/fe/test/ObjectPage'], function(ObjectPage) {
    'use strict';

    var CustomPageDefinitions = {
        actions: {},
        assertions: {}
    };

    return new ObjectPage(
        {
            appId: 'reporterg49',
            componentId: 'RG49ReportObjectPage',
            contextPath: '/RG49Report/Set'
        },
        CustomPageDefinitions
    );
});