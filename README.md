##JunctionTagPicker##

JunctionTagPicker is a Power Apps Component Framework (PCF) control designed for model-driven apps that need a user-friendly way to manage many-to-many record relationships in Dataverse. It provides a tag-style picker experience for selecting related records, displaying useful metadata for each choice, and handling the association/disassociation workflow without forcing users to navigate away from the current form.

The control is especially useful in scenarios where a record is connected to multiple related records through a custom N:N relationship. Instead of manually creating or deleting links through a generic lookup experience, users can search for records by name, review secondary details such as email or title, and quickly manage the relationship from a single control. The component automatically resolves the active relationship metadata at runtime, so it can work with the correct intersect table, entity names, and identifier fields without hardcoded assumptions.

Key features
Search-driven record selection for related entities
Support for many-to-many Dataverse relationships
Auto-resolution of relationship metadata from Dataverse
Filtering of already-linked records from the search results
Optional subtitle information such as email address or job title
Built-in handling for relationship validation and permission-aware behavior
Works with the current form context and entity metadata
Compatible with model-driven app controls using Fluent UI and React
Why this control exists
In Dataverse, many-to-many relationships are often implemented through an intersect table, which can make the relationship difficult to manage in a form experience. Standard lookup controls do not always provide the clarity or usability needed when users need to manage several linked records quickly. JunctionTagPicker simplifies that process by turning the relationship into an interactive, searchable tag list that feels natural and lightweight within the form.

Control behavior
The control reads the configured relationship name from the manifest and resolves the relationship definition through the Dataverse Web API. It then determines:

the parent entity
the linked entity
the intersect entity
the relevant attribute names for IDs and display names
the navigation property used for association operations
Once this metadata is resolved, the control can:

search for candidate records
exclude records already connected to the current parent
retrieve currently linked records
associate a selected record with the parent
disassociate a selected record when needed
This keeps the logic generic and relationship-driven rather than hardcoded to a single entity pair.

Architecture
The control is structured around a small set of responsibilities:

a manager layer for relationship metadata and Dataverse operations
a search and retrieval layer for related records
a UI layer for rendering the tag/picker experience
configuration parsing for relationship and display settings
utilities for filtering, escaping, and GUID normalization
This separation keeps the codebase maintainable and makes it easier to extend for additional metadata fields or alternate UX patterns.

Typical usage
This control is intended for scenario-based configuration in a model-driven form where a parent record should maintain a list of linked records through a N:N relationship. For example:

an account linked to multiple contacts
a custom entity linked to several related records
a project record that maintains a set of team members or associated records
The control can be configured with the relationship name and optional metadata attributes, while the actual entity mapping and table names are discovered dynamically from Dataverse.

Summary
JunctionTagPicker provides a practical and flexible way to manage related records in Dataverse while keeping the user experience simple and fast. By combining relationship-aware metadata resolution with a searchable tag-picker UI, it makes N:N record management easier to use and easier to maintain in model-driven app solutions.

