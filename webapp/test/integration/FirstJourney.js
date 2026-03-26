sap.ui.define([
    "sap/ui/test/opaQunit",
    "./pages/JourneyRunner"
], function (opaTest, runner) {
    "use strict";

    function journey() {
        QUnit.module("First journey");

        opaTest("Start application", function (Given, When, Then) {
            Given.iStartMyApp();

            Then.onTheRG49ReportList.iSeeThisPage();
            Then.onTheRG49ReportList.onTable().iCheckColumns(5, {"P_PeriodTo":{"header":"Período Hasta"},"P_PeriodFrom":{"header":"Período Desde"},"P_FiscalYearPrev":{"header":"Ejercicio Anterior"},"P_FiscalYear":{"header":"Ejercicio"},"P_CompanyCode":{"header":"Sociedad"}});

        });


        opaTest("Navigate to ObjectPage", function (Given, When, Then) {
            // Note: this test will fail if the ListReport page doesn't show any data
            
            When.onTheRG49ReportList.onFilterBar().iExecuteSearch();
            
            Then.onTheRG49ReportList.onTable().iCheckRows();

            When.onTheRG49ReportList.onTable().iPressRow(0);
            Then.onTheRG49ReportObjectPage.iSeeThisPage();

        });

        opaTest("Teardown", function (Given, When, Then) { 
            // Cleanup
            Given.iTearDownMyApp();
        });
    }

    runner.run([journey]);
});