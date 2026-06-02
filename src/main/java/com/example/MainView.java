package com.example;

import com.vaadin.flow.component.button.Button;
import com.vaadin.flow.component.html.H1;
import com.vaadin.flow.component.orderedlayout.VerticalLayout;
import com.vaadin.flow.component.textfield.TextField;
import com.vaadin.flow.router.Route;

/**
 * Minimal form view used as the agentic-DX benchmark target.
 *
 * Stable hooks for the scripted Playwright observer:
 *   - #app-title  : styled via styles.css (CSS-only change scenario)
 *   - #name       : a form field
 *   - #submit     : button whose caption is the Java method-body change scenario
 *
 * Java structural change scenario = adding another component (e.g. an email field)
 * to the layout below.
 */
@Route("")
public class MainView extends VerticalLayout {

    public MainView() {
        H1 title = new H1("Sign up");
        title.setId("app-title");

        TextField name = new TextField("Name");
        name.setId("name");

        Button submit = new Button("Submit");
        submit.setId("submit");

        add(title, name, submit);
    }
}
