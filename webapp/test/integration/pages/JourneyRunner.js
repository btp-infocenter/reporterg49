sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"reporterg49/test/integration/pages/RG49ReportList",
	"reporterg49/test/integration/pages/RG49ReportObjectPage"
], function (JourneyRunner, RG49ReportList, RG49ReportObjectPage) {
    'use strict';

    var runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('reporterg49') + '/test/flp.html#app-preview',
        pages: {
			onTheRG49ReportList: RG49ReportList,
			onTheRG49ReportObjectPage: RG49ReportObjectPage
        },
        async: true
    });

    return runner;
});

